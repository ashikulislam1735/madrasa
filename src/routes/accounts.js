// বেতন (ফি) ও খরচের হিসাব — শুধু অ্যাডমিন
const router = require('express').Router();
const { col } = require('../db');
const { requireRole } = require('../auth');
const { bad, wrap, clientId, str, num, isDate, isMonth } = require('../util');

router.use(requireRole('admin'));
const nextMonthStart = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`; };

// GET /api/accounts/fees?month=2026-10 → { studentId: {amount,status} } ; ?from=&to= → { month: {...} }
router.get('/fees', wrap(async (req, res) => {
  const fp = await col('feePayments');
  if (isMonth(req.query.from) && isMonth(req.query.to)) {
    const out = {};
    for (const r of await fp.find({ month: { $gte: req.query.from, $lte: req.query.to } }).toArray()) (out[r.month] ||= {})[r.studentId] = { amount: r.amount, status: r.status };
    return res.json(out);
  }
  if (!isMonth(req.query.month)) throw bad('month (YYYY-MM) দিন');
  const rows = await fp.find({ month: req.query.month }).toArray();
  res.json(Object.fromEntries(rows.map((r) => [r.studentId, { amount: r.amount, status: r.status }])));
}));

// PUT /api/accounts/fees { month, payments: { studentId: amount } } — স্ট্যাটাস সার্ভার হিসাব করে
router.put('/fees', wrap(async (req, res) => {
  const { month, payments } = req.body;
  if (!isMonth(month)) throw bad('month (YYYY-MM) দিন');
  if (!payments || typeof payments !== 'object') throw bad('payments দিন');
  const ids = Object.keys(payments);
  if (!ids.length) return res.json({ saved: 0 });
  const studs = await (await col('students')).find({ _id: { $in: ids } }, { projection: { monthlyFee: 1 } }).toArray();
  if (studs.length !== ids.length) throw bad('কিছু ছাত্র পাওয়া যায়নি');
  const fee = Object.fromEntries(studs.map((s) => [s._id, s.monthlyFee || 0]));
  const ops = ids.map((sid) => {
    const amount = num(payments[sid]);
    if (amount < 0) throw bad('টাকার পরিমাণ ঋণাত্মক হতে পারে না');
    const f = fee[sid];
    const status = (f === 0 || amount >= f) ? 'paid' : amount > 0 ? 'partial' : 'due';
    return { updateOne: { filter: { _id: `${month}|${sid}` }, update: { $set: { month, studentId: sid, amount, status, updatedAt: new Date() } }, upsert: true } };
  });
  await (await col('feePayments')).bulkWrite(ops);
  res.json({ saved: ids.length });
}));

const expOut = (e) => ({ id: e._id, date: e.date, note: e.note, amount: e.amount });
router.get('/expenses', wrap(async (req, res) => {
  const filter = {};
  if (req.query.month) {
    if (!isMonth(req.query.month)) throw bad('month ভুল');
    filter.date = { $gte: `${req.query.month}-01`, $lt: nextMonthStart(req.query.month) };
  }
  res.json((await (await col('expenses')).find(filter).sort({ date: -1, createdAt: -1 }).toArray()).map(expOut));
}));
router.post('/expenses', wrap(async (req, res) => {
  const date = req.body.date, amount = num(req.body.amount, -1);
  if (!isDate(date) || amount <= 0) throw bad('সঠিক তারিখ ও টাকার পরিমাণ দিন');
  const doc = { _id: clientId(req.body.id, 'exp'), date, note: str(req.body.note, 300), amount, createdAt: new Date() };
  await (await col('expenses')).insertOne(doc);
  res.status(201).json(expOut(doc));
}));
router.delete('/expenses/:id', wrap(async (req, res) => { await (await col('expenses')).deleteOne({ _id: req.params.id }); res.json({ ok: true }); }));

// মাসিক সারাংশ: আদায়, বকেয়া, খরচ, নিট
router.get('/summary', wrap(async (req, res) => {
  if (!isMonth(req.query.month)) throw bad('month (YYYY-MM) দিন');
  const m = req.query.month;
  const pays = await (await col('feePayments')).find({ month: m }).toArray();
  const collected = pays.reduce((a, p) => a + p.amount, 0);
  const exps = await (await col('expenses')).find({ date: { $gte: `${m}-01`, $lt: nextMonthStart(m) } }).toArray();
  const expenses = exps.reduce((a, e) => a + e.amount, 0);
  const expected = (await (await col('students')).find({}, { projection: { monthlyFee: 1 } }).toArray()).reduce((a, s) => a + (s.monthlyFee || 0), 0);
  const count = (st) => pays.filter((p) => p.status === st).length;
  res.json({ month: m, expectedFees: expected, collected, outstanding: Math.max(0, expected - collected),
    counts: { paid: count('paid'), partial: count('partial'), due: count('due') }, expenses, net: collected - expenses });
}));

module.exports = router;
