// ব্যাকএন্ড API ক্লায়েন্ট — app.js-এর Firebase কলগুলোর জায়গায় এটি ব্যবহার হবে।
// একই ডোমেইনে সার্ভ হলে BASE খালি থাকে; আলাদা ডোমেইনে হলে window.API_BASE সেট করুন।
const BASE = (window.API_BASE || '') + '/api';
let token = null, role = null;
try { token = sessionStorage.getItem('token'); role = sessionStorage.getItem('role'); } catch {}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { api.logout(); }          // মেয়াদ শেষ → লগআউট
  if (!res.ok) throw Object.assign(new Error(json.error || 'অনুরোধ ব্যর্থ'), { status: res.status });
  return json;
}
const setToken = (t, r) => { token = t; role = t ? r : null; try { if (t) { sessionStorage.setItem('token', t); sessionStorage.setItem('role', r); } else { sessionStorage.removeItem('token'); sessionStorage.removeItem('role'); } } catch {} };
const qs = (o) => { const s = new URLSearchParams(Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null))).toString(); return s ? '?' + s : ''; };

export const api = {
  get isLoggedIn() { return !!token; },
  get role() { return role; },   // 'admin' | 'teacher' | 'guardian' | null
  logout() { setToken(null); },

  // সাধারণ কল (sync.js ব্যবহার করে)
  get: (p) => req('GET', p), post: (p, b) => req('POST', p, b), put: (p, b) => req('PUT', p, b), del: (p) => req('DELETE', p),

  // ---- লগইন ----
  async login(asRole, mobile, password) { const r = await req('POST', '/auth/login', { role: asRole, mobile, password }); const role = asRole; setToken(r.token, role); return r.user; },
  async teacherSignup(name, mobile, password) { const r = await req('POST', '/auth/teacher/signup', { name, mobile, password }); setToken(r.token, 'teacher'); return r.user; },
  async guardianLogin(studentCode, mobile) { const r = await req('POST', '/auth/guardian', { studentCode, mobile }); setToken(r.token, 'guardian'); return r.student; },
  me: () => req('GET', '/auth/me'),
  changePassword: (oldPassword, newPassword) => req('POST', '/auth/change-password', { oldPassword, newPassword }),

  // ---- পাবলিক ----
  overview: () => req('GET', '/public/overview'),
  branches: () => req('GET', '/branches'),
  jamaats: () => req('GET', '/jamaats'),
  notices: () => req('GET', '/notices'),
  holidays: () => req('GET', '/holidays'),
  boardResults: () => req('GET', '/board-results'),
  competitionResults: () => req('GET', '/competition-results'),
  submitAdmission: (form) => req('POST', '/admissions', form),

  // ---- শিক্ষক/অ্যাডমিন ----
  students: (p) => req('GET', '/students' + qs(p)),
  addStudent: (s) => req('POST', '/students', s),
  updateStudent: (id, s) => req('PUT', '/students/' + id, s),
  deleteStudent: (id) => req('DELETE', '/students/' + id),
  attendance: (p) => req('GET', '/attendance' + qs(p)),                       // {date} বা {month}
  saveAttendance: (date, records) => req('PUT', '/attendance', { date, records }),
  exams: (p) => req('GET', '/exams' + qs(p)),
  saveExams: (year, examType, results) => req('PUT', '/exams', { year, examType, results }),
  updateJamaat: (id, patch) => req('PUT', '/jamaats/' + id, patch),

  // ---- শুধু অ্যাডমিন ----
  teachers: () => req('GET', '/teachers'),
  updateTeacher: (id, patch) => req('PATCH', '/teachers/' + id, patch),
  setJamaatTeachers: (jamaatId, userIds) => req('PUT', `/jamaats/${jamaatId}/teachers`, { userIds }),
  fees: (month) => req('GET', '/accounts/fees?month=' + month),
  feesRange: (from, to) => req('GET', '/accounts/fees' + qs({ from, to })),
  saveFees: (month, payments) => req('PUT', '/accounts/fees', { month, payments }),
  expenses: (month) => req('GET', '/accounts/expenses' + qs({ month })),
  addExpense: (e) => req('POST', '/accounts/expenses', e),
  deleteExpense: (id) => req('DELETE', '/accounts/expenses/' + id),
  accountingSummary: (month) => req('GET', '/accounts/summary?month=' + month),
  admissions: (status) => req('GET', '/admissions' + qs({ status })),
  approveAdmission: (id) => req('POST', `/admissions/${id}/approve`, {}),
  rejectAdmission: (id) => req('POST', `/admissions/${id}/reject`, {}),
  addNotice: (text, dateLabel) => req('POST', '/notices', { text, dateLabel }),
  deleteNotice: (id) => req('DELETE', '/notices/' + id),
  addHoliday: (h) => req('POST', '/holidays', h),
  deleteHoliday: (id) => req('DELETE', '/holidays/' + id),
  saveBoardResult: (b) => b.id ? req('PUT', '/board-results/' + b.id, b) : req('POST', '/board-results', b),
  deleteBoardResult: (id) => req('DELETE', '/board-results/' + id),
  saveCompetitionResult: (r) => r.id ? req('PUT', '/competition-results/' + r.id, r) : req('POST', '/competition-results', r),
  deleteCompetitionResult: (id) => req('DELETE', '/competition-results/' + id),

  // ---- অভিভাবক ----
  guardianMe: (month) => req('GET', '/guardian/me' + qs({ month })),
};
