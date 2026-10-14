const router = require('express').Router();
const { col } = require('../db');
const { wrap } = require('../util');

// হোম স্ক্রিনের সারাংশ: লগইন ছাড়াই দেখা যায়, কিন্তু কোনো ব্যক্তিগত তথ্য নেই
router.get('/overview', wrap(async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [students, teachers, jamaats, notices, holidays] = await Promise.all([
    (await col('students')).countDocuments(),
    (await col('users')).countDocuments({ role: 'teacher', active: true }),
    (await col('jamaats')).countDocuments(),
    (await col('notices')).find().sort({ createdAt: -1 }).limit(5).toArray(),
    (await col('holidays')).find({ end: { $gte: today } }).sort({ start: 1 }).limit(10).toArray(),
  ]);
  res.json({
    totalStudents: students, totalTeachers: teachers, totalJamaats: jamaats,
    notices: notices.map((r) => ({ id: r._id, text: r.text, dateLabel: r.dateLabel || '' })),
    holidays: holidays.map((r) => ({ id: r._id, name: r.name, start: r.start, end: r.end })),
  });
}));

module.exports = router;
