// ব্যবহার: ADMIN_MOBILE=01XXXXXXXXX ADMIN_PASSWORD='শক্তপাসওয়ার্ড' npm run create-admin
const bcrypt = require('bcryptjs');
const { col, close, ensureIndexes } = require('../src/db');
const { normMobile } = require('../src/util');
(async () => {
  const mobile = normMobile(process.env.ADMIN_MOBILE), pass = process.env.ADMIN_PASSWORD || '';
  if (!/^01\d{9}$/.test(mobile) || pass.length < 8) { console.error('ADMIN_MOBILE (০১xxxxxxxxx) ও ৮+ অক্ষরের ADMIN_PASSWORD দিন'); process.exit(1); }
  await ensureIndexes();
  await (await col('users')).updateOne({ role: 'admin', mobile },
    { $set: { passwordHash: await bcrypt.hash(pass, 10), active: true, name: process.env.ADMIN_NAME || 'অ্যাডমিন' }, $setOnInsert: { jamaatIds: [], createdAt: new Date() } }, { upsert: true });
  console.log('অ্যাডমিন প্রস্তুত ✓'); await close();
})().catch((e) => { console.error(e); process.exit(1); });
