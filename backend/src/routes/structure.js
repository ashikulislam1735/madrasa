// শাখা, জামাত, শিক্ষক ব্যবস্থাপনা
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { col } = require('../db');
const { requireRole } = require('../auth');
const { HttpError, bad, wrap, clientId, str, normMobile, isOid } = require('../util');

const jamaatOut = (r) => ({ id: r._id, branchId: r.branchId ?? null, name: r.name, teacher: r.teacher || '', subjects: r.subjects || [] });
const admin = requireRole('admin');
const oid = (v) => { if (!isOid(v)) throw new HttpError(404, 'পাওয়া যায়নি'); return new ObjectId(v); };

// ---------- শাখা ----------
router.get('/branches', wrap(async (_req, res) => {
  res.json((await (await col('branches')).find().sort({ createdAt: 1 }).toArray()).map((b) => ({ id: b._id, name: b.name })));
}));
router.post('/branches', admin, wrap(async (req, res) => {
  const name = str(req.body.name, 100); if (!name) throw bad('শাখার নাম দিন');
  const id = clientId(req.body.id, 'br');
  await (await col('branches')).insertOne({ _id: id, name, createdAt: new Date() });
  res.status(201).json({ id, name });
}));
router.put('/branches/:id', admin, wrap(async (req, res) => {
  const name = str(req.body.name, 100); if (!name) throw bad('শাখার নাম দিন');
  const r = await (await col('branches')).updateOne({ _id: req.params.id }, { $set: { name } });
  if (!r.matchedCount) throw new HttpError(404, 'শাখা পাওয়া যায়নি');
  res.json({ id: req.params.id, name });
}));
router.delete('/branches/:id', admin, wrap(async (req, res) => {
  await (await col('branches')).deleteOne({ _id: req.params.id });
  await (await col('jamaats')).updateMany({ branchId: req.params.id }, { $set: { branchId: null } });
  res.json({ ok: true });
}));

// ---------- জামাত ----------
router.get('/jamaats', wrap(async (_req, res) => {
  res.json((await (await col('jamaats')).find().sort({ createdAt: 1, name: 1 }).toArray()).map(jamaatOut));
}));
router.post('/jamaats', admin, wrap(async (req, res) => {
  const name = str(req.body.name, 100); if (!name) throw bad('জামাতের নাম দিন');
  const doc = { _id: clientId(req.body.id, 'jm'), branchId: req.body.branchId || null, name, teacher: str(req.body.teacher, 100),
    subjects: Array.isArray(req.body.subjects) ? req.body.subjects : [], createdAt: new Date() };
  await (await col('jamaats')).insertOne(doc);
  res.status(201).json(jamaatOut(doc));
}));
// শিক্ষক নিজের জামাতের বিষয় (subjects) বদলাতে পারবে; নাম/শাখা শুধু অ্যাডমিন
router.put('/jamaats/:id', requireRole('admin', 'teacher'), wrap(async (req, res) => {
  const u = req.user;
  if (u.role === 'teacher' && !u.jamaatIds.includes(req.params.id)) throw new HttpError(403, 'এই জামাত আপনার নয়');
  const jam = await col('jamaats');
  const cur = await jam.findOne({ _id: req.params.id });
  if (!cur) throw new HttpError(404, 'জামাত পাওয়া যায়নি');
  const isAdmin = u.role === 'admin';
  const next = {
    subjects: Array.isArray(req.body.subjects) ? req.body.subjects : cur.subjects,
    name: isAdmin && req.body.name ? str(req.body.name, 100) : cur.name,
    teacher: isAdmin && req.body.teacher !== undefined ? str(req.body.teacher, 100) : cur.teacher,
    branchId: isAdmin && req.body.branchId !== undefined ? req.body.branchId : cur.branchId,
  };
  await jam.updateOne({ _id: req.params.id }, { $set: next });
  res.json(jamaatOut({ _id: req.params.id, ...next }));
}));
router.delete('/jamaats/:id', admin, wrap(async (req, res) => {
  await (await col('jamaats')).deleteOne({ _id: req.params.id });
  await (await col('routines')).deleteOne({ _id: req.params.id });
  await (await col('students')).updateMany({ jamaatId: req.params.id }, { $set: { jamaatId: null } });
  await (await col('users')).updateMany({}, { $pull: { jamaatIds: req.params.id } });
  res.json({ ok: true });
}));
// জামাতে শিক্ষক নিয়োগ
router.put('/jamaats/:id/teachers', admin, wrap(async (req, res) => {
  const ids = (Array.isArray(req.body.userIds) ? req.body.userIds : []).map(String).filter(isOid).map((x) => new ObjectId(x));
  const users = await col('users');
  await users.updateMany({}, { $pull: { jamaatIds: req.params.id } });
  if (ids.length) await users.updateMany({ _id: { $in: ids }, role: 'teacher' }, { $addToSet: { jamaatIds: req.params.id } });
  res.json({ ok: true });
}));

// ---------- শিক্ষক অ্যাকাউন্ট (অ্যাডমিন) ----------
router.get('/teachers', admin, wrap(async (_req, res) => {
  const rows = await (await col('users')).find({ role: 'teacher' }).sort({ createdAt: 1 }).toArray();
  res.json(rows.map((r) => ({ id: String(r._id), name: r.name, mobile: r.mobile, active: r.active, jamaatIds: r.jamaatIds || [] })));
}));
router.patch('/teachers/:id', admin, wrap(async (req, res) => {
  const set = {};
  if (req.body.name !== undefined) set.name = str(req.body.name, 100);
  if (req.body.active !== undefined) set.active = !!req.body.active;
  if (req.body.mobile !== undefined) set.mobile = normMobile(req.body.mobile);
  if (req.body.newPassword) {
    if (String(req.body.newPassword).length < 6) throw bad('পাসওয়ার্ড কমপক্ষে ৬ অক্ষর');
    set.passwordHash = await bcrypt.hash(String(req.body.newPassword), 10);
  }
  if (!Object.keys(set).length) throw bad('কিছু বদলানোর নেই');
  let r;
  try { r = await (await col('users')).updateOne({ _id: oid(req.params.id), role: 'teacher' }, { $set: set }); }
  catch (e) { if (e.code === 11000) throw new HttpError(409, 'এই মোবাইল নম্বর আগে থেকেই আছে'); throw e; }
  if (!r.matchedCount) throw new HttpError(404, 'শিক্ষক পাওয়া যায়নি');
  res.json({ ok: true });
}));
router.delete('/teachers/:id', admin, wrap(async (req, res) => {
  await (await col('users')).deleteOne({ _id: oid(req.params.id), role: 'teacher' }); res.json({ ok: true });
}));

module.exports = router;
