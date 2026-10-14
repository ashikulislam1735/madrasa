// ইনডেক্স তৈরি (বারবার চালালেও নিরাপদ) + ডিফল্ট শাখা/জামাত (ডেটাবেজ খালি থাকলে)
const { col, ensureIndexes, close } = require('../src/db');
(async () => {
  await ensureIndexes();
  const branches = await col('branches');
  if (!(await branches.countDocuments())) {
    const now = new Date();
    await branches.insertOne({ _id: 'br_main', name: 'মূল শাখা', createdAt: now });
    await (await col('jamaats')).insertMany([['jm_hifz_takmil_br_main', 'হিফজ তাকমিল'], ['jm_hifz_sobok_br_main', 'হিফজ সবক'], ['jm_najera_br_main', 'নাজেরা']]
      .map(([_id, name], i) => ({ _id, branchId: 'br_main', name, teacher: '', subjects: [], createdAt: new Date(now.getTime() + i) })));
  }
  console.log('ডেটাবেজ প্রস্তুত ✓');
  await close();
})().catch((e) => { console.error(e); process.exit(1); });
