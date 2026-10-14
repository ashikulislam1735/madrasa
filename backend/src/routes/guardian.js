// অভিভাবক পোর্টাল: টোকেন শুধু একজন ছাত্রের তথ্য দেখার অনুমতি দেয়
const router = require('express').Router();
const { col } = require('../db');
const { requireRole } = require('../auth');
const { wrap, isMonth } = require('../util');
const { out: studentOut } = require('./students');

const nextMonthStart = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`; };

router.get('/me', requireRole('guardian'), wrap(async (req, res) => {
  const sid = req.user.studentId;
  const month = isMonth(req.query.month) ? req.query.month : new Date().toISOString().slice(0, 7);
  const s = await (await col('students')).findOne({ _id: sid });
  const j = s.jamaatId ? await (await col('jamaats')).findOne({ _id: s.jamaatId }) : null;
  const jamaat = j ? { id: j._id, name: j.name, teacher: j.teacher || '', subjects: j.subjects || [] } : null;
  const att = (await (await col('attendance')).find({ studentId: sid, date: { $gte: `${month}-01`, $lt: nextMonthStart(month) } }).sort({ date: 1 }).toArray())
    .map((a) => ({ date: a.date, status: a.status }));
  const exams = {};
  for (const r of await (await col('examResults')).find({ studentId: sid }).toArray()) ((exams[r.year] ||= {})[r.examType]) = r.marks;
  const fees = (await (await col('feePayments')).find({ studentId: sid }).sort({ month: -1 }).limit(24).toArray()).map((f) => ({ month: f.month, amount: f.amount, status: f.status }));
  const board = (await (await col('boardResults')).find({ studentId: sid }).toArray()).map((r) => ({ ...(r.data || {}), id: r._id, name: r.name, board: r.board, year: r.year }));
  const { guardianNID, birthReg, ...student } = studentOut(s); // সংবেদনশীল পরিচয়পত্র নম্বর ফেরত দেওয়া হয় না
  res.json({ student, jamaat, month,
    attendance: { records: att, present: att.filter((a) => a.status === 'present').length, absent: att.filter((a) => a.status === 'absent').length },
    exams, fees, boardResults: board });
}));

module.exports = router;
