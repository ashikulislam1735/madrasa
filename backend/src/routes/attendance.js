const router = require('express').Router();
const { col } = require('../db');
const { requireRole, visibleStudentIds } = require('../auth');
const { HttpError, bad, wrap, isDate, isMonth } = require('../util');

const STATUSES = ['present', 'absent', 'leave', 'late'];
const nextMonthStart = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`; };

// কোন ছাত্রদের উপর ইউজারের অধিকার আছে (আইডির তালিকা থেকে অনুমোদিতগুলো)
async function allowedStudentIds(user, ids) {
  const filter = { _id: { $in: ids } };
  if (user.role === 'teacher') filter.jamaatId = { $in: user.jamaatIds };
  return new Set((await (await col('students')).find(filter, { projection: { _id: 1 } }).toArray()).map((s) => s._id));
}

// GET /api/attendance?date=…  → { studentId: status } ; ?month=… বা ?from=&to=… → { date: { studentId: status } }
router.get('/', requireRole('admin', 'teacher'), wrap(async (req, res) => {
  const { date, month, jamaatId, from, to } = req.query;
  const range = isDate(from) && isDate(to);
  if (!isDate(date) && !isMonth(month) && !range) throw bad('date, month (YYYY-MM) অথবা from+to দিন');
  const filter = {};
  if (isDate(date)) filter.date = date;
  else if (range) filter.date = { $gte: from, $lte: to };
  else filter.date = { $gte: `${month}-01`, $lt: nextMonthStart(month) };
  const ids = await visibleStudentIds(req.user, jamaatId ? String(jamaatId) : null);
  if (ids) filter.studentId = { $in: ids };
  const rows = await (await col('attendance')).find(filter).toArray();
  if (isDate(date)) return res.json(Object.fromEntries(rows.map((r) => [r.studentId, r.status])));
  const out = {};
  for (const r of rows) (out[r.date] ||= {})[r.studentId] = r.status;
  res.json(out);
}));

// PUT /api/attendance { date, records: { studentId: status } } — একসাথে অনেকগুলো
router.put('/', requireRole('admin', 'teacher'), wrap(async (req, res) => {
  const { date, records } = req.body;
  if (!isDate(date)) throw bad('সঠিক তারিখ দিন');
  if (date > new Date(Date.now() + 24 * 3600e3).toISOString().slice(0, 10)) throw bad('ভবিষ্যতের তারিখে হাজিরা দেওয়া যাবে না');
  if (!records || typeof records !== 'object') throw bad('records দিন');
  const entries = Object.entries(records);
  if (!entries.length) return res.json({ saved: 0 });
  for (const [, st] of entries) if (!STATUSES.includes(st)) throw bad('অবৈধ হাজিরা স্ট্যাটাস');
  const ok = await allowedStudentIds(req.user, entries.map((e) => e[0]));
  if (ok.size !== entries.length) throw new HttpError(403, 'কিছু ছাত্র আপনার জামাতের নয়');
  await (await col('attendance')).bulkWrite(entries.map(([sid, st]) => ({
    updateOne: { filter: { _id: `${date}|${sid}` }, update: { $set: { date, studentId: sid, status: st, markedBy: req.user.id, updatedAt: new Date() } }, upsert: true },
  })));
  res.json({ saved: entries.length });
}));

module.exports = router;
