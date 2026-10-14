const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017';
process.env.MONGODB_DB = process.env.TEST_MONGODB_DB || 'madrasa_test';
process.env.NODE_ENV = 'test';
const { db, close } = require('../src/db');
const app = require('../src/app');

let server, base, admin, teacher, other;
const call = async (method, url, body, token) => {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, body: json };
};
const run = (script, env = {}, args = []) => execFileSync('node', [path.join(__dirname, '..', 'scripts', script), ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });

before(async () => {
  await (await db()).dropDatabase();
  run('init-db.js');
  run('create-admin.js', { ADMIN_MOBILE: '01711111111', ADMIN_PASSWORD: 'AdminPass123' });
  server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await close(); });

test('অ্যাডমিন লগইন: ভুল পাসওয়ার্ড বাতিল, সঠিক হলে টোকেন', async () => {
  assert.equal((await call('POST', '/api/auth/login', { role: 'admin', mobile: '01711111111', password: 'wrong' })).status, 401);
  const r = await call('POST', '/api/auth/login', { role: 'admin', mobile: '০১৭১১১১১১১১', password: 'AdminPass123' }); // বাংলা অঙ্কও চলবে
  assert.equal(r.status, 200); admin = r.body.token;
});

test('লগইন ছাড়া স্পর্শকাতর ডেটা পাওয়া যায় না', async () => {
  for (const u of ['/api/students', '/api/attendance?date=2026-10-14', '/api/accounts/fees?month=2026-10', '/api/admissions', '/api/teachers'])
    assert.equal((await call('GET', u)).status, 401, u);
});

test('শিক্ষক সাইনআপ → জামাত না দেওয়া পর্যন্ত ছাত্র যোগ করা যায় না', async () => {
  const s = await call('POST', '/api/auth/teacher/signup', { name: 'উস্তাদ আহমদ', mobile: '01822222222', password: 'secret1' });
  assert.equal(s.status, 201); teacher = s.body.token; const tid = s.body.user.id;
  assert.equal((await call('POST', '/api/auth/teacher/signup', { name: 'x', mobile: '01822222222', password: 'secret1' })).status, 409);
  const jam = (await call('GET', '/api/jamaats')).body;
  assert.ok(jam.length >= 3);
  const [j1, j2] = jam;
  assert.equal((await call('POST', '/api/students', { name: 'ক', jamaatId: j1.id }, teacher)).status, 403);
  assert.equal((await call('PUT', `/api/jamaats/${j1.id}/teachers`, { userIds: [tid] }, teacher)).status, 403); // শিক্ষক নিজেকে নিয়োগ দিতে পারবে না
  assert.equal((await call('PUT', `/api/jamaats/${j1.id}/teachers`, { userIds: [tid] }, admin)).status, 200);
  other = { j1, j2, tid };
});

test('ছাত্র: শিক্ষক শুধু নিজের জামাতে, আইডি ডুপ্লিকেট হয় না', async () => {
  const { j1, j2 } = other;
  const a = await call('POST', '/api/students', { name: 'আব্দুল্লাহ', jamaatId: j1.id, guardianMobile: '01933333333', monthlyFee: 500, fatherName: 'রহিম' }, teacher);
  const b = await call('POST', '/api/students', { name: 'ইউসুফ', jamaatId: j1.id, guardianMobile: '01944444444', monthlyFee: 300 }, teacher);
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  assert.match(a.body.studentId, /^AKQ-\d{4}-001$/); assert.match(b.body.studentId, /-002$/);
  assert.equal(a.body.roll, 1); assert.equal(b.body.roll, 2); assert.equal(a.body.fatherName, 'রহিম');
  assert.equal((await call('POST', '/api/students', { name: 'বাইরের', jamaatId: j2.id }, teacher)).status, 403);
  const adminOther = await call('POST', '/api/students', { name: 'অন্য জামাত', jamaatId: j2.id }, admin);
  assert.equal(adminOther.status, 201);
  const list = await call('GET', '/api/students', null, teacher);
  assert.equal(list.body.length, 2); // অন্য জামাতের ছাত্র দেখে না
  assert.equal((await call('GET', `/api/students/${adminOther.body.id}`, null, teacher)).status, 403);
  assert.equal((await call('DELETE', `/api/students/${a.body.id}`, null, teacher)).status, 403);
  other.a = a.body; other.b = b.body; other.foreign = adminOther.body;
});

test('হাজিরা: বাল্ক সেভ, ওভাররাইট, অন্য জামাতের ছাত্র নিষিদ্ধ', async () => {
  const { a, b, foreign } = other, date = '2026-10-13';
  assert.equal((await call('PUT', '/api/attendance', { date, records: { [a.id]: 'present', [b.id]: 'absent' } }, teacher)).body.saved, 2);
  assert.equal((await call('PUT', '/api/attendance', { date, records: { [b.id]: 'present' } }, teacher)).status, 200); // আপডেট
  const day = await call('GET', `/api/attendance?date=${date}`, null, teacher);
  assert.deepEqual(day.body, { [a.id]: 'present', [b.id]: 'present' });
  assert.equal((await call('PUT', '/api/attendance', { date, records: { [foreign.id]: 'present' } }, teacher)).status, 403);
  assert.equal((await call('PUT', '/api/attendance', { date, records: { [a.id]: 'hacked' } }, teacher)).status, 400);
  assert.equal((await call('PUT', '/api/attendance', { date: '2099-01-01', records: { [a.id]: 'present' } }, teacher)).status, 400);
  const month = await call('GET', '/api/attendance?month=2026-10', null, teacher);
  assert.equal(Object.keys(month.body[date]).length, 2);
});

test('পরীক্ষার ফলাফল সেভ/পড়া', async () => {
  const { a } = other;
  assert.equal((await call('PUT', '/api/exams', { year: '2026', examType: 'annual', results: { [a.id]: { কুরআন: 90, আরবি: 80 } } }, teacher)).status, 200);
  const r = await call('GET', '/api/exams?year=2026&examType=annual', null, teacher);
  assert.equal(r.body[a.id]['কুরআন'], 90);
  assert.equal((await call('GET', '/api/exams', null, teacher)).body['2026'].annual[a.id]['আরবি'], 80);
});

test('বেতন: স্ট্যাটাস সার্ভার হিসাব করে, শিক্ষক পারে না', async () => {
  const { a, b } = other;
  assert.equal((await call('PUT', '/api/accounts/fees', { month: '2026-10', payments: {} }, teacher)).status, 403);
  await call('PUT', '/api/accounts/fees', { month: '2026-10', payments: { [a.id]: 500, [b.id]: 100 } }, admin);
  const f = (await call('GET', '/api/accounts/fees?month=2026-10', null, admin)).body;
  assert.equal(f[a.id].status, 'paid'); assert.equal(f[b.id].status, 'partial');
  await call('POST', '/api/accounts/expenses', { date: '2026-10-05', note: 'বিদ্যুৎ', amount: 200 }, admin);
  const s = (await call('GET', '/api/accounts/summary?month=2026-10', null, admin)).body;
  assert.equal(s.collected, 600); assert.equal(s.expenses, 200); assert.equal(s.net, 400);
  assert.equal((await call('POST', '/api/accounts/expenses', { date: '2026-10-05', amount: -5 }, admin)).status, 400);
});

test('অভিভাবক: আইডি+মোবাইল মিললেই শুধু নিজের সন্তানের তথ্য', async () => {
  const { a, b } = other;
  assert.equal((await call('POST', '/api/auth/guardian', { studentCode: a.studentId, mobile: '01999999999' })).status, 401);
  const g = await call('POST', '/api/auth/guardian', { studentCode: a.studentId.toLowerCase(), mobile: '+8801933333333' });
  assert.equal(g.status, 200);
  const me = await call('GET', '/api/guardian/me?month=2026-10', null, g.body.token);
  assert.equal(me.body.student.name, 'আব্দুল্লাহ');
  assert.equal(me.body.attendance.present, 1); assert.equal(me.body.exams['2026'].annual['কুরআন'], 90);
  assert.equal(me.body.fees[0].status, 'paid');
  for (const u of ['/api/students', `/api/students/${b.id}`, '/api/accounts/fees?month=2026-10', '/api/admissions'])
    assert.equal((await call('GET', u, null, g.body.token)).status, 403, u);
});

test('ভর্তি আবেদন: পাবলিক জমা → অ্যাডমিন অনুমোদনে ছাত্র তৈরি', async () => {
  const { j1 } = other;
  assert.equal((await call('POST', '/api/admissions', { name: 'নতুন', phone: '' , jamaatId: j1.id })).status, 400);
  const r = await call('POST', '/api/admissions', { name: 'নতুন ছাত্র', phone: '01655555555', jamaatId: j1.id, fatherName: 'করিম' });
  assert.equal(r.status, 201);
  const ap = await call('POST', `/api/admissions/${r.body.id}/approve`, {}, admin);
  assert.equal(ap.status, 200); assert.ok(ap.body.studentId);
  assert.equal((await call('POST', `/api/admissions/${r.body.id}/approve`, {}, admin)).status, 409);
  const st = await call('GET', `/api/students/${ap.body.studentId}`, null, admin);
  assert.equal(st.body.fatherName, 'করিম'); assert.match(st.body.studentId, /-004$/); // ৪র্থ ছাত্র
  assert.equal((await call('GET', '/api/admissions', null, teacher)).status, 403);
});

test('নোটিশ/ছুটি: সবাই পড়বে, শুধু অ্যাডমিন লিখবে', async () => {
  assert.equal((await call('POST', '/api/notices', { text: 'কাল ছুটি' }, teacher)).status, 403);
  assert.equal((await call('POST', '/api/notices', { text: 'কাল ছুটি', dateLabel: '১৪ অক্টোবর' }, admin)).status, 201);
  assert.equal((await call('POST', '/api/holidays', { name: 'ঈদ', start: '2026-12-01', end: '2026-11-01' }, admin)).status, 400);
  assert.equal((await call('GET', '/api/notices')).body.length, 1);
  const ov = await call('GET', '/api/public/overview');
  assert.equal(ov.body.totalStudents, 4);
});

test('নিষ্ক্রিয় শিক্ষকের টোকেন সাথে সাথে অকেজো', async () => {
  assert.equal((await call('PATCH', `/api/teachers/${other.tid}`, { active: false }, admin)).status, 200);
  assert.equal((await call('GET', '/api/students', null, teacher)).status, 401);
});

test('ফ্রন্টএন্ডের নিজের আইডি গ্রহণ + তারিখের পরিসরে লোড', async () => {
  const { j1 } = other;
  const st = await call('POST', '/api/students', { id: 's_1760000000000', name: 'ক্লায়েন্ট-আইডি', jamaatId: j1.id }, admin);
  assert.equal(st.status, 201, JSON.stringify(st.body)); assert.equal(st.body.id, 's_1760000000000');
  const bad = await call('POST', '/api/students', { id: "x'; DROP TABLE students;--", name: 'খারাপ আইডি', jamaatId: j1.id }, admin);
  assert.equal(bad.status, 201); assert.match(bad.body.id, /^s_/); // ভুল ফরম্যাটের আইডি বাতিল, সার্ভার নিজে বানায়
  assert.equal((await call('POST', '/api/notices', { id: 'nt_abc123', text: 'x' }, admin)).body.id, 'nt_abc123');
  const range = await call('GET', '/api/attendance?from=2026-10-01&to=2026-10-31', null, admin);
  assert.equal(Object.keys(range.body).length, 1);
  const fees = await call('GET', '/api/accounts/fees?from=2026-09&to=2026-11', null, admin);
  assert.equal(Object.keys(fees.body['2026-10']).length, 2);
});
