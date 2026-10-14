// নোটিশ, ছুটি, বোর্ড ফলাফল, প্রতিযোগিতার ফলাফল — পড়া সবার জন্য, লেখা শুধু অ্যাডমিন
const router = require('express').Router();
const { col } = require('../db');
const { requireRole } = require('../auth');
const { bad, wrap, newId, clientId, str, isDate } = require('../util');

const admin = requireRole('admin');

// ---------- নোটিশ ----------
const noticeOut = (r) => ({ id: r._id, text: r.text, dateLabel: r.dateLabel || '', createdAt: new Date(r.createdAt).getTime() });
router.get('/notices', wrap(async (_req, res) => {
  res.json((await (await col('notices')).find().sort({ createdAt: -1 }).limit(200).toArray()).map(noticeOut));
}));
router.post('/notices', admin, wrap(async (req, res) => {
  const text = str(req.body.text, 2000); if (!text) throw bad('নোটিশের লেখা দিন');
  const doc = { _id: clientId(req.body.id, 'nt'), text, dateLabel: str(req.body.dateLabel, 60), createdAt: new Date() };
  await (await col('notices')).insertOne(doc);
  res.status(201).json(noticeOut(doc));
}));
router.delete('/notices/:id', admin, wrap(async (req, res) => { await (await col('notices')).deleteOne({ _id: req.params.id }); res.json({ ok: true }); }));

// ---------- ছুটি ----------
const holidayOut = (r) => ({ id: r._id, name: r.name, start: r.start, end: r.end });
router.get('/holidays', wrap(async (_req, res) => {
  res.json((await (await col('holidays')).find().sort({ start: 1 }).toArray()).map(holidayOut));
}));
router.post('/holidays', admin, wrap(async (req, res) => {
  const name = str(req.body.name, 150), start = req.body.start, end = req.body.end || req.body.start;
  if (!name || !isDate(start) || !isDate(end) || end < start) throw bad('নাম ও সঠিক তারিখ দিন');
  const doc = { _id: clientId(req.body.id, 'hd'), name, start, end };
  await (await col('holidays')).insertOne(doc);
  res.status(201).json(holidayOut(doc));
}));
router.delete('/holidays/:id', admin, wrap(async (req, res) => { await (await col('holidays')).deleteOne({ _id: req.params.id }); res.json({ ok: true }); }));

// ---------- বোর্ড ও প্রতিযোগিতা (অতিরিক্ত ফিল্ড data-তে) ----------
const boardOut = (r) => ({ ...(r.data || {}), id: r._id, studentId: r.studentId || undefined, name: r.name, board: r.board, year: r.year });
router.get('/board-results', wrap(async (_req, res) => {
  res.json((await (await col('boardResults')).find().sort({ year: -1, createdAt: -1 }).toArray()).map(boardOut));
}));
router.post('/board-results', admin, wrap(async (req, res) => upsertBoard(req, res)));
router.put('/board-results/:id', admin, wrap(async (req, res) => upsertBoard(req, res, req.params.id)));
async function upsertBoard(req, res, id) {
  const { id: _i, studentId, name: rawName, board, year, ...rest } = req.body;
  const name = str(rawName, 150); if (!name) throw bad('নাম দিন');
  const rid = id || clientId(req.body.id, 'br');
  await (await col('boardResults')).updateOne({ _id: rid },
    { $set: { studentId: studentId || null, name, board: str(board, 100), year: str(year, 10), data: rest }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  res.status(id ? 200 : 201).json({ id: rid });
}
router.delete('/board-results/:id', admin, wrap(async (req, res) => { await (await col('boardResults')).deleteOne({ _id: req.params.id }); res.json({ ok: true }); }));

const compOut = (r) => ({ ...(r.data || {}), id: r._id, studentId: r.studentId || undefined, year: r.year, createdAt: new Date(r.createdAt).getTime() });
router.get('/competition-results', wrap(async (_req, res) => {
  res.json((await (await col('competitionResults')).find().sort({ createdAt: -1 }).toArray()).map(compOut));
}));
router.post('/competition-results', admin, wrap(async (req, res) => upsertComp(req, res)));
router.put('/competition-results/:id', admin, wrap(async (req, res) => upsertComp(req, res, req.params.id)));
async function upsertComp(req, res, id) {
  const { id: _i, studentId, year, createdAt, ...rest } = req.body;
  const rid = id || clientId(req.body.id, 'cr');
  await (await col('competitionResults')).updateOne({ _id: rid },
    { $set: { studentId: studentId || null, year: str(year, 10), data: rest }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  res.status(id ? 200 : 201).json({ id: rid });
}
router.delete('/competition-results/:id', admin, wrap(async (req, res) => { await (await col('competitionResults')).deleteOne({ _id: req.params.id }); res.json({ ok: true }); }));

module.exports = router;
