// ক্লাস রুটিন: দেখা সবার জন্য (অভিভাবকসহ), বদলানো শুধু অ্যাডমিন
const router = require('express').Router();
const { col } = require('../db');
const { requireRole } = require('../auth');
const { HttpError, bad, wrap, str } = require('../util');

const DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// প্রতিটি ক্লাস: { day, start, end, subject, teacher } — ভুল হলে পুরো তালিকাই বাতিল
function cleanEntries(list) {
  if (!Array.isArray(list)) throw bad('রুটিনের তালিকা দিন');
  if (list.length > 80) throw bad('একটি জামাতে সর্বোচ্চ ৮০টি ক্লাস যোগ করা যাবে');
  return list.map((e, i) => {
    const day = String(e?.day || ''), start = String(e?.start || ''), end = String(e?.end || '');
    const subject = str(e?.subject, 80);
    if (!DAYS.includes(day)) throw bad(`ক্লাস ${i + 1}: বার ঠিক নয়`);
    if (!TIME.test(start) || !TIME.test(end) || end <= start) throw bad(`ক্লাস ${i + 1}: সময় ঠিক নয় (শেষ সময় শুরুর পরে হতে হবে)`);
    if (!subject) throw bad(`ক্লাস ${i + 1}: বিষয়ের নাম দিন`);
    return { day, start, end, subject, teacher: str(e?.teacher, 80) };
  });
}

// সব জামাতের রুটিন: { জামাতের-আইডি: [ক্লাস, ...] }
router.get('/routines', wrap(async (_req, res) => {
  const rows = await (await col('routines')).find().toArray();
  res.json(Object.fromEntries(rows.map((r) => [r._id, r.entries || []])));
}));

router.put('/routines/:jamaatId', requireRole('admin'), wrap(async (req, res) => {
  const jamaatId = str(req.params.jamaatId, 80);
  if (!(await (await col('jamaats')).findOne({ _id: jamaatId }))) throw new HttpError(404, 'জামাত পাওয়া যায়নি');
  const entries = cleanEntries(req.body.entries);
  await (await col('routines')).updateOne({ _id: jamaatId }, { $set: { entries, updatedAt: new Date() } }, { upsert: true });
  res.json({ ok: true, entries });
}));

module.exports = router;
module.exports.cleanEntries = cleanEntries;
