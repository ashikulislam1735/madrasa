const router = require('express').Router();
const { col } = require('../db');
const { requireRole, visibleStudentIds } = require('../auth');
const { HttpError, bad, wrap, str } = require('../util');

// GET /api/exams?year&examType&jamaatId → { studentId: marks } ; কিছু না দিলে { year: { examType: { studentId: marks } } }
router.get('/', requireRole('admin', 'teacher'), wrap(async (req, res) => {
  const filter = {};
  if (req.query.year) filter.year = String(req.query.year);
  if (req.query.examType) filter.examType = String(req.query.examType);
  const ids = await visibleStudentIds(req.user, req.query.jamaatId ? String(req.query.jamaatId) : null);
  if (ids) filter.studentId = { $in: ids };
  const rows = await (await col('examResults')).find(filter).toArray();
  if (req.query.year && req.query.examType) return res.json(Object.fromEntries(rows.map((r) => [r.studentId, r.marks])));
  const out = {};
  for (const r of rows) ((out[r.year] ||= {})[r.examType] ||= {})[r.studentId] = r.marks;
  res.json(out);
}));

// PUT /api/exams { year, examType, results: { studentId: {বিষয়: নম্বর} } }
router.put('/', requireRole('admin', 'teacher'), wrap(async (req, res) => {
  const year = str(req.body.year, 10), examType = str(req.body.examType, 40), results = req.body.results;
  if (!/^\d{4}$/.test(year) && year !== 'legacy') throw bad('সঠিক বছর দিন');
  if (!examType) throw bad('পরীক্ষার ধরন দিন');
  if (!results || typeof results !== 'object') throw bad('results দিন');
  const ids = Object.keys(results);
  if (!ids.length) return res.json({ saved: 0 });
  const filter = { _id: { $in: ids } };
  if (req.user.role === 'teacher') filter.jamaatId = { $in: req.user.jamaatIds };
  const found = await (await col('students')).countDocuments(filter);
  if (found !== ids.length) throw new HttpError(403, 'কিছু ছাত্র আপনার জামাতের নয়');
  for (const sid of ids) if (results[sid] === null || typeof results[sid] !== 'object') throw bad('নম্বরের ফরম্যাট ভুল');
  await (await col('examResults')).bulkWrite(ids.map((sid) => ({
    updateOne: { filter: { _id: `${year}|${examType}|${sid}` }, update: { $set: { year, examType, studentId: sid, marks: results[sid], updatedAt: new Date() } }, upsert: true },
  })));
  res.json({ saved: ids.length });
}));

module.exports = router;
