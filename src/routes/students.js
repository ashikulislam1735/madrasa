const router = require('express').Router();
const { col } = require('../db');
const { requireRole, canAccessJamaat } = require('../auth');
const { HttpError, bad, wrap, clientId, str, num, isDate, escapeRegex } = require('../util');

const CORE = ['id', 'studentId', 'jamaatId', 'name', 'roll', 'guardianMobile', 'monthlyFee', 'admissionDate'];

// ডেটাবেজ ডকুমেন্ট → ফ্রন্টএন্ডের ছাত্র-অবজেক্টের আকার
const out = (r) => ({
  id: r._id, studentId: r.studentCode, jamaatId: r.jamaatId ?? null, name: r.name, roll: r.roll ?? null,
  guardianMobile: r.guardianMobile || '', monthlyFee: r.monthlyFee || 0, admissionDate: r.admissionDate || null, ...(r.data || {}),
});

// ডুপ্লিকেট ছাড়া ছাত্র আইডি: AKQ-2026-001 (অ্যাটমিক কাউন্টার)
async function nextStudentCode(year = new Date().getFullYear()) {
  const r = await (await col('counters')).findOneAndUpdate({ _id: `student-${year}` }, { $inc: { last: 1 } }, { upsert: true, returnDocument: 'after' });
  const doc = r && r.value !== undefined ? r.value : r; // ড্রাইভার সংস্করণ ভেদে
  return `AKQ-${year}-${String(doc.last).padStart(3, '0')}`;
}
async function nextRoll(jamaatId) {
  const top = await (await col('students')).find({ jamaatId }).sort({ roll: -1 }).limit(1).toArray();
  return (top[0]?.roll || 0) + 1;
}

function split(body) {
  const extra = {};
  for (const [k, v] of Object.entries(body || {})) if (!CORE.includes(k)) extra[k] = v;
  return {
    name: str(body.name, 150),
    roll: body.roll === undefined || body.roll === '' ? null : Math.trunc(num(body.roll, 0)) || null,
    guardianMobile: str(body.guardianMobile, 20),
    monthlyFee: Math.max(0, num(body.monthlyFee)),
    admissionDate: isDate(body.admissionDate) ? body.admissionDate : null,
    extra,
  };
}

router.get('/', requireRole('admin', 'teacher'), wrap(async (req, res) => {
  const u = req.user, filter = {};
  if (u.role === 'teacher') filter.jamaatId = { $in: u.jamaatIds };
  if (req.query.jamaatId) {
    const j = String(req.query.jamaatId);
    filter.jamaatId = u.role === 'teacher' && !u.jamaatIds.includes(j) ? '__none__' : j;
  }
  if (req.query.q) filter.name = { $regex: escapeRegex(String(req.query.q)), $options: 'i' };
  const rows = await (await col('students')).find(filter).sort({ jamaatId: 1, roll: 1, name: 1 }).toArray();
  res.json(rows.map(out));
}));

router.post('/', requireRole('admin', 'teacher'), wrap(async (req, res) => {
  const jamaatId = str(req.body.jamaatId, 80);
  if (!jamaatId || !canAccessJamaat(req.user, jamaatId)) throw new HttpError(403, 'এই জামাতে ছাত্র যোগ করার অনুমতি নেই');
  const f = split(req.body);
  if (!f.name) throw bad('ছাত্রের নাম দিন');
  const doc = {
    _id: clientId(req.body.id, 's'), studentCode: await nextStudentCode(), jamaatId, name: f.name, roll: f.roll || await nextRoll(jamaatId),
    guardianMobile: f.guardianMobile, monthlyFee: f.monthlyFee, admissionDate: f.admissionDate || new Date().toISOString().slice(0, 10),
    data: f.extra, createdAt: new Date(), updatedAt: new Date(),
  };
  try { await (await col('students')).insertOne(doc); }
  catch (e) { if (e.code === 11000) throw new HttpError(409, 'এই আইডির ছাত্র আগে থেকেই আছে'); throw e; }
  res.status(201).json(out(doc));
}));

async function loadAllowed(req) {
  const s = await (await col('students')).findOne({ _id: req.params.id });
  if (!s) throw new HttpError(404, 'ছাত্র পাওয়া যায়নি');
  if (!canAccessJamaat(req.user, s.jamaatId)) throw new HttpError(403, 'এই ছাত্রের তথ্যে অনুমতি নেই');
  return s;
}

router.get('/:id', requireRole('admin', 'teacher'), wrap(async (req, res) => res.json(out(await loadAllowed(req)))));

router.put('/:id', requireRole('admin', 'teacher'), wrap(async (req, res) => {
  const cur = await loadAllowed(req);
  const f = split({ ...out(cur), ...req.body });
  if (!f.name) throw bad('ছাত্রের নাম দিন');
  let jamaatId = cur.jamaatId;
  if (req.body.jamaatId && req.body.jamaatId !== cur.jamaatId) {
    if (!canAccessJamaat(req.user, req.body.jamaatId)) throw new HttpError(403, 'নতুন জামাতে সরানোর অনুমতি নেই');
    jamaatId = req.body.jamaatId;
  }
  const set = { jamaatId, name: f.name, roll: f.roll, guardianMobile: f.guardianMobile, monthlyFee: f.monthlyFee,
    admissionDate: f.admissionDate || cur.admissionDate, data: f.extra, updatedAt: new Date() };
  await (await col('students')).updateOne({ _id: req.params.id }, { $set: set });
  res.json(out({ ...cur, ...set }));
}));

router.delete('/:id', requireRole('admin'), wrap(async (req, res) => {
  const id = req.params.id;
  await (await col('students')).deleteOne({ _id: id });
  for (const c of ['attendance', 'examResults', 'feePayments']) await (await col(c)).deleteMany({ studentId: id });
  await (await col('boardResults')).updateMany({ studentId: id }, { $set: { studentId: null } });
  await (await col('competitionResults')).updateMany({ studentId: id }, { $set: { studentId: null } });
  res.json({ ok: true });
}));

module.exports = router;
module.exports.out = out;
module.exports.nextStudentCode = nextStudentCode;
module.exports.nextRoll = nextRoll;
