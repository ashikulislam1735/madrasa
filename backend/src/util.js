const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);

// async হ্যান্ডলারের এরর Express-এ পাঠানোর র‍্যাপার
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const newId = (prefix) => `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

// বাংলা অঙ্ক → ইংরেজি, এবং শুধু অঙ্ক রাখা (মোবাইল নম্বর মেলানোর জন্য)
const BN = '০১২৩৪৫৬৭৮৯';
function normMobile(v) {
  let s = String(v || '').replace(/[০-৯]/g, d => BN.indexOf(d)).replace(/\D/g, '');
  if (s.startsWith('880')) s = s.slice(2);
  if (s.length === 10 && s[0] === '1') s = '0' + s;
  return s;
}

// ফ্রন্টএন্ড নিজের তৈরি আইডি (যেমন s_1760…) পাঠাতে পারে; ফরম্যাট ঠিক থাকলে গ্রহণ, নইলে সার্ভার নিজে বানায়
const clientId = (v, prefix) => (new RegExp('^' + prefix + '_[A-Za-z0-9_-]{1,60}$').test(String(v || '')) ? String(v) : newId(prefix));

const escapeRegex = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isOid = (v) => /^[0-9a-f]{24}$/i.test(String(v || ''));

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s));
const isMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ''));
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

module.exports = { HttpError, bad, wrap, newId, clientId, escapeRegex, isOid, normMobile, isDate, isMonth, str, num };
