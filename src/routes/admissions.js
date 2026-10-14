const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { col } = require('../db');
const { requireRole } = require('../auth');
const { HttpError, bad, wrap, newId, str, normMobile } = require('../util');
const { nextStudentCode, nextRoll } = require('./students');

const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'অনেকগুলো আবেদন জমা হয়েছে, পরে চেষ্টা করুন' } });

const out = (r) => ({ ...(r.data || {}), id: r._id, status: r.status, name: r.name, phone: r.phone, jamaatId: r.jamaatId ?? null,
  studentId: r.studentId || undefined, date: r.date });

// পাবলিক আবেদন ফর্ম
router.post('/', submitLimiter, wrap(async (req, res) => {
  const { id: _i, status: _s, date: _d, name, phone, jamaatId, ...rest } = req.body || {};
  if (!str(name) || !normMobile(phone) || !jamaatId) throw bad('ছাত্রের নাম, মোবাইল নম্বর ও ক্লাস অবশ্যই দিতে হবে।');
  if (JSON.stringify(rest).length > 20000) throw bad('আবেদনের তথ্য অতিরিক্ত বড়'); // স্প্যাম ঠেকাতে
  if (!(await (await col('jamaats')).findOne({ _id: String(jamaatId) }, { projection: { _id: 1 } }))) throw bad('জামাত সঠিক নয়');
  const id = newId('adm');
  await (await col('admissions')).insertOne({ _id: id, status: 'pending', name: str(name, 150), phone: str(phone, 20), jamaatId: String(jamaatId),
    studentId: null, data: rest, date: new Date().toISOString().slice(0, 10), createdAt: new Date() });
  res.status(201).json({ id });
}));

router.get('/', requireRole('admin'), wrap(async (req, res) => {
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  res.json((await (await col('admissions')).find(filter).sort({ date: -1, createdAt: -1 }).toArray()).map(out));
}));

// অনুমোদন দিলে একই সাথে ছাত্র তৈরি হয়। আগে "pending → approved" দাবি করে নেওয়া হয় (দুবার ক্লিকেও ছাত্র একটাই)
router.post('/:id/approve', requireRole('admin'), wrap(async (req, res) => {
  const adm = await col('admissions');
  const claimed = await adm.findOneAndUpdate({ _id: req.params.id, status: { $ne: 'approved' } }, { $set: { status: 'approved' } }, { returnDocument: 'before' });
  const a = claimed && claimed.value !== undefined ? claimed.value : claimed;
  if (!a) {
    if (await adm.findOne({ _id: req.params.id })) throw new HttpError(409, 'আবেদন আগেই অনুমোদিত');
    throw new HttpError(404, 'আবেদন পাওয়া যায়নি');
  }
  let studentId = null;
  if (req.body.createStudent !== false && a.jamaatId) {
    studentId = newId('s');
    const d = a.data || {};
    await (await col('students')).insertOne({
      _id: studentId, studentCode: await nextStudentCode(), jamaatId: a.jamaatId, name: a.name, roll: await nextRoll(a.jamaatId),
      guardianMobile: a.phone, monthlyFee: 0, admissionDate: new Date().toISOString().slice(0, 10),
      data: { fatherName: d.fatherName || '', motherName: d.motherName || '', dob: d.dob || '', address: d.address || '', admissionId: a._id },
      createdAt: new Date(), updatedAt: new Date(),
    });
    await adm.updateOne({ _id: a._id }, { $set: { studentId } });
  }
  res.json({ id: a._id, status: 'approved', studentId });
}));

router.post('/:id/reject', requireRole('admin'), wrap(async (req, res) => {
  const r = await (await col('admissions')).updateOne({ _id: req.params.id, status: 'pending' }, { $set: { status: 'rejected' } });
  if (!r.matchedCount) throw new HttpError(404, 'অপেক্ষমাণ আবেদন পাওয়া যায়নি');
  res.json({ id: req.params.id, status: 'rejected' });
}));

router.delete('/:id', requireRole('admin'), wrap(async (req, res) => { await (await col('admissions')).deleteOne({ _id: req.params.id }); res.json({ ok: true }); }));

module.exports = router;
