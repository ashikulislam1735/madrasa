const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const rateLimit = require('express-rate-limit');
const { col } = require('../db');
const { sign, requireRole } = require('../auth');
const { HttpError, bad, wrap, normMobile, str } = require('../util');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'অনেকবার চেষ্টা হয়েছে, ১৫ মিনিট পরে আবার চেষ্টা করুন' } });

const publicUser = (u) => ({ id: String(u._id), role: u.role, name: u.name, mobile: u.mobile });
const DUMMY = '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';

// অ্যাডমিন/শিক্ষক লগইন
router.post('/login', limiter, wrap(async (req, res) => {
  const role = str(req.body.role), mobile = normMobile(req.body.mobile), password = String(req.body.password || '');
  if (!['admin', 'teacher'].includes(role) || !mobile || !password) throw bad('মোবাইল ও পাসওয়ার্ড দিন');
  const u = await (await col('users')).findOne({ role, mobile });
  const ok = await bcrypt.compare(password, u ? u.passwordHash : DUMMY); // টাইমিং সমান রাখতে
  if (!u || !ok || !u.active) throw new HttpError(401, 'মোবাইল বা পাসওয়ার্ড ভুল');
  res.json({ token: sign({ uid: String(u._id), role: u.role }), user: publicUser(u) });
}));

// শিক্ষক নিজে সাইনআপ করবে; অ্যাডমিন জামাত যুক্ত না করা পর্যন্ত কোনো ডেটায় প্রবেশাধিকার নেই
router.post('/teacher/signup', limiter, wrap(async (req, res) => {
  const name = str(req.body.name, 100), mobile = normMobile(req.body.mobile), password = String(req.body.password || '');
  if (!name || !/^01\d{9}$/.test(mobile)) throw bad('নাম ও সঠিক মোবাইল নম্বর দিন');
  if (password.length < 6) throw bad('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
  const doc = { role: 'teacher', name, mobile, passwordHash: await bcrypt.hash(password, 10), active: true, jamaatIds: [], createdAt: new Date() };
  try { await (await col('users')).insertOne(doc); }
  catch (e) { if (e.code === 11000) throw new HttpError(409, 'এই মোবাইল নম্বর দিয়ে আগেই অ্যাকাউন্ট আছে, লগইন করুন'); throw e; }
  res.status(201).json({ token: sign({ uid: String(doc._id), role: 'teacher' }), user: publicUser(doc) });
}));

// অভিভাবক: ছাত্র আইডি + অভিভাবকের মোবাইল মিললে শুধু ওই ছাত্রের তথ্যের টোকেন
router.post('/guardian', limiter, wrap(async (req, res) => {
  const code = str(req.body.studentCode, 50).toUpperCase(), mobile = normMobile(req.body.mobile);
  if (!code || !mobile) throw bad('ছাত্র আইডি ও অভিভাবকের মোবাইল নম্বর দিন');
  const s = await (await col('students')).findOne({ studentCode: code });
  if (!s || normMobile(s.guardianMobile) !== mobile) throw new HttpError(401, 'তথ্য মেলেনি');
  res.json({ token: sign({ role: 'guardian', studentId: s._id }), student: { id: s._id, name: s.name } });
}));

router.get('/me', wrap(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'লগইন প্রয়োজন');
  res.json({ user: req.user });
}));

router.post('/change-password', requireRole('admin', 'teacher'), wrap(async (req, res) => {
  const oldP = String(req.body.oldPassword || ''), newP = String(req.body.newPassword || '');
  if (newP.length < 8 && req.user.role === 'admin') throw bad('অ্যাডমিন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে');
  if (newP.length < 6) throw bad('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
  const users = await col('users'), _id = new ObjectId(req.user.id);
  const u = await users.findOne({ _id });
  if (!(await bcrypt.compare(oldP, u.passwordHash))) throw new HttpError(401, 'বর্তমান পাসওয়ার্ড ভুল');
  await users.updateOne({ _id }, { $set: { passwordHash: await bcrypt.hash(newP, 10) } });
  res.json({ ok: true });
}));

module.exports = router;
