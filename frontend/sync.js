// ডেটা লোড ও সংরক্ষণ স্তর।
// পুরনো অ্যাপ একটা বড় `data` অবজেক্ট বদলে saveData() ডাকত। এখানে সেই অবজেক্টই রাখা হয়েছে (যাতে UI কোড প্রায় অপরিবর্তিত থাকে),
// কিন্তু সংরক্ষণের সময় আগের অবস্থার সাথে তুলনা করে শুধু যা বদলেছে সেটুকুই API-তে পাঠানো হয়।
import { api } from '/api.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const RANGE_MONTHS = 12; // হাজিরা ও বেতন শুরুতে কত মাসের লোড হবে

export function emptyData() {
  return { branches: [], jamaats: [], students: [], attendance: {}, examResults: {}, teacherAccounts: {}, guardianAccounts: {},
    notices: [], holidays: [], boardResults: [], competitionResults: [], admissions: [], feePayments: {}, expenses: [], overview: null };
}

const pad = (n) => String(n).padStart(2, '0');
function rangeDates() {
  const to = new Date(); const from = new Date(to.getFullYear(), to.getMonth() - RANGE_MONTHS + 1, 1);
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: iso(from), to: iso(to), fromMonth: iso(from).slice(0, 7), toMonth: iso(to).slice(0, 7) };
}

// ---------- লোড ----------
export async function loadData() {
  const role = api.role;
  const d = emptyData();
  const [branches, jamaats, notices, holidays, boardResults, competitionResults, overview] = await Promise.all([
    api.branches(), api.jamaats(), api.notices(), api.holidays(), api.boardResults(), api.competitionResults(), api.overview(),
  ]);
  Object.assign(d, { branches, jamaats, notices, holidays, boardResults, competitionResults, overview });

  if (role === 'admin' || role === 'teacher') {
    const r = rangeDates();
    const [students, attendance, exams] = await Promise.all([api.students(), api.attendance({ from: r.from, to: r.to }), api.exams()]);
    d.students = students; d.attendance = attendance; d.examResults = exams;
    if (role === 'admin') {
      const [teachers, fees, expenses, admissions] = await Promise.all([api.teachers(), api.feesRange(r.fromMonth, r.toMonth), api.expenses(), api.admissions()]);
      for (const t of teachers) d.teacherAccounts[String(t.id)] = { name: t.name, mobile: t.mobile, jamaatIds: t.jamaatIds, active: t.active };
      d.feePayments = fees; d.expenses = expenses; d.admissions = admissions;
    } else {
      const me = (await api.me()).user;
      d.teacherAccounts[String(me.id)] = { name: me.name, mobile: me.mobile, jamaatIds: me.jamaatIds || [] };
    }
    // জামাতের পাশে "কোন শিক্ষক অ্যাকাউন্ট যুক্ত" দেখানোর পুরনো ফিল্ড
    for (const j of d.jamaats) {
      const uid = Object.keys(d.teacherAccounts).find((u) => d.teacherAccounts[u].jamaatIds.includes(j.id));
      if (uid) j.teacherUid = uid;
    }
  }
  snapshot = clone(d);
  return d;
}

// অভিভাবক সেশনে শুধু নিজের সন্তানের তথ্য `data`-তে বসানো হয় (সংরক্ষণ বন্ধ থাকে)
export async function loadGuardian(d) {
  const g = await api.guardianMe();
  d.students = [{ ...g.student }];
  d.attendance = {};
  for (const a of g.attendance.records) (d.attendance[a.date] ||= {})[g.student.id] = a.status;
  d.examResults = g.exams;
  d.feePayments = {};
  for (const f of g.fees) (d.feePayments[f.month] ||= {})[g.student.id] = { amount: f.amount, status: f.status };
  return g;
}

// ---------- সংরক্ষণ (পার্থক্য পাঠানো) ----------
let snapshot = emptyData();
let chain = Promise.resolve();

export function resetSnapshot(d) { snapshot = clone(d); }

export function saveData(d) {
  if (api.role !== 'admin' && api.role !== 'teacher') return Promise.resolve();
  chain = chain.catch(() => {}).then(() => syncAll(d));   // একসাথে অনেকগুলো সেভ হলেও ক্রমানুসারে
  return chain;
}

// আইডি-ভিত্তিক তালিকার পার্থক্য: নতুন/বদলানো → upsert, মুছে ফেলা → remove। প্রতিটি সফল ধাপের পরই স্ন্যাপশট হালনাগাদ হয়,
// তাই মাঝপথে ব্যর্থ হলে পরের সেভে শুধু বাকিগুলোই আবার চেষ্টা হয়।
async function syncList(name, cur, { create, update, remove, onlyDeletes, skipDeletes }) {
  const before = new Map((snapshot[name] || []).map((x) => [x.id, x]));
  const now = new Map((cur || []).map((x) => [x.id, x]));
  if (!onlyDeletes) {
    for (const [id, item] of now) {
      const old = before.get(id);
      if (!old) {
        const created = create ? await create(item) : null;
        if (created) Object.assign(item, created);
        snapshot[name].push(clone(item));
      } else if (!same(old, item)) {
        if (update) await update(item, old);
        snapshot[name][snapshot[name].findIndex((x) => x.id === id)] = clone(item);
      }
    }
  }
  if (!skipDeletes) {
    for (const [id] of before) {
      if (!now.has(id)) { if (remove) await remove(id); snapshot[name] = snapshot[name].filter((x) => x.id !== id); }
    }
  }
}

async function syncAll(d) {
  const admin = api.role === 'admin';
  const S = snapshot;

  if (admin) {
    await syncList('branches', d.branches, {
      create: (b) => api.post('/branches', b), update: (b) => api.put('/branches/' + b.id, b), remove: (id) => api.del('/branches/' + id) });
  }
  // জামাত: তৈরি/বদল আগে, মুছে ফেলা ছাত্র মুছার পরে
  await syncList('jamaats', d.jamaats, {
    skipDeletes: true,
    create: (j) => api.post('/jamaats', { id: j.id, branchId: j.branchId, name: j.name, teacher: j.teacher || '', subjects: j.subjects || [] }),
    update: (j) => api.updateJamaat(j.id, { name: j.name, teacher: j.teacher || '', branchId: j.branchId, subjects: j.subjects || [] }),
  });

  // শিক্ষক ↔ জামাত নিয়োগ (শুধু অ্যাডমিন)
  if (admin) {
    const asSets = (acc) => { const m = {}; for (const [uid, t] of Object.entries(acc || {})) for (const j of t.jamaatIds || []) (m[j] ||= []).push(uid); return m; };
    const was = asSets(S.teacherAccounts), now = asSets(d.teacherAccounts);
    for (const jid of new Set([...Object.keys(was), ...Object.keys(now)])) {
      if (!d.jamaats.some((j) => j.id === jid)) continue;
      if (!same((was[jid] || []).slice().sort(), (now[jid] || []).slice().sort())) {
        await api.setJamaatTeachers(jid, now[jid] || []);
        S.teacherAccounts = clone(d.teacherAccounts);
      }
    }
  }

  await syncList('students', d.students, {
    create: async (s) => { const r = await api.addStudent(s); return { studentId: r.studentId, roll: r.roll }; },
    update: (s) => api.updateStudent(s.id, s),
    remove: (id) => api.deleteStudent(id),
  });
  await syncList('jamaats', d.jamaats, { onlyDeletes: true, remove: (id) => api.del('/jamaats/' + id) });

  // হাজিরা: তারিখ ধরে বদলানো রেকর্ড একসাথে
  for (const [date, rec] of Object.entries(d.attendance || {})) {
    const old = S.attendance[date] || {};
    const changed = {};
    for (const [sid, st] of Object.entries(rec)) if (old[sid] !== st) changed[sid] = st;
    if (Object.keys(changed).length) { await api.saveAttendance(date, changed); S.attendance[date] = { ...old, ...changed }; }
  }

  // পরীক্ষার নম্বর
  for (const [year, types] of Object.entries(d.examResults || {})) for (const [type, res] of Object.entries(types || {})) {
    const old = (S.examResults[year] || {})[type] || {};
    const changed = {};
    for (const [sid, marks] of Object.entries(res || {})) if (!same(old[sid], marks)) changed[sid] = marks;
    if (Object.keys(changed).length) {
      await api.saveExams(year, type, changed);
      ((S.examResults[year] ||= {})[type] ||= {});
      Object.assign(S.examResults[year][type], clone(changed));
    }
  }

  if (admin) {
    // বেতন: শুধু টাকার পরিমাণ পাঠানো হয়, স্ট্যাটাস সার্ভার হিসাব করে
    for (const [month, rec] of Object.entries(d.feePayments || {})) {
      const old = S.feePayments[month] || {};
      const changed = {};
      for (const [sid, p] of Object.entries(rec)) if (!old[sid] || Number(old[sid].amount) !== Number(p.amount)) changed[sid] = Number(p.amount) || 0;
      if (Object.keys(changed).length) {
        await api.saveFees(month, changed);
        S.feePayments[month] = { ...old, ...clone(Object.fromEntries(Object.keys(changed).map((sid) => [sid, rec[sid]]))) };
      }
    }
    await syncList('expenses', d.expenses, { create: (e) => api.addExpense(e), remove: (id) => api.deleteExpense(id) });
    await syncList('notices', d.notices, { create: (n) => api.post('/notices', n), remove: (id) => api.deleteNotice(id) });
    await syncList('holidays', d.holidays, { create: (h) => api.addHoliday(h), remove: (id) => api.deleteHoliday(id) });
    await syncList('boardResults', d.boardResults, {
      create: (b) => api.put('/board-results/' + b.id, b), update: (b) => api.put('/board-results/' + b.id, b), remove: (id) => api.deleteBoardResult(id) });
    await syncList('competitionResults', d.competitionResults, {
      create: (r) => api.put('/competition-results/' + r.id, r), update: (r) => api.put('/competition-results/' + r.id, r), remove: (id) => api.deleteCompetitionResult(id) });

    // ভর্তি: স্ট্যাটাস বদল → approve/reject (approve করলে সার্ভার ছাত্র তৈরি করে, তা এনে তালিকায় যোগ করা হয়)
    for (const a of d.admissions || []) {
      const old = (S.admissions || []).find((x) => x.id === a.id);
      if (!old || old.status === a.status) continue;
      if (a.status === 'approved') {
        const r = await api.approveAdmission(a.id);
        if (r.studentId && !d.students.some((s) => s.id === r.studentId)) {
          const st = await api.get('/students/' + r.studentId);
          d.students.push(st); S.students.push(clone(st));
        }
        a.studentId = r.studentId;
      } else if (a.status === 'rejected') await api.rejectAdmission(a.id);
      old.status = a.status;
    }
  }
}
