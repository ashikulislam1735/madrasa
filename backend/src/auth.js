const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const config = require('./config');
const { col } = require('./db');
const { HttpError, wrap, isOid } = require('./util');

const sign = (payload) => jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpires });

// টোকেন থাকলে req.user বসায় (না থাকলে পাবলিক)
const authenticate = wrap(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return next();
  let p;
  try { p = jwt.verify(h.slice(7), config.jwtSecret); }
  catch { throw new HttpError(401, 'সেশনের মেয়াদ শেষ, আবার লগইন করুন'); }

  if (p.role === 'guardian') { req.user = { role: 'guardian', studentId: p.studentId }; return next(); }
  // প্রতিবার ডেটাবেজ থেকে যাচাই: নিষ্ক্রিয়/মুছে ফেলা শিক্ষক সাথে সাথে ব্লক হবে
  const u = isOid(p.uid) ? await (await col('users')).findOne({ _id: new ObjectId(p.uid) }) : null;
  if (!u || !u.active) throw new HttpError(401, 'অ্যাকাউন্ট নিষ্ক্রিয় বা পাওয়া যায়নি');
  req.user = { id: String(u._id), role: u.role, name: u.name, mobile: u.mobile, jamaatIds: u.role === 'teacher' ? (u.jamaatIds || []) : [] };
  next();
});

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'লগইন প্রয়োজন'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'এই কাজের অনুমতি নেই'));
  next();
};

// শিক্ষক শুধু নিজের জামাত পরিচালনা করতে পারবে; অ্যাডমিন সব
const canAccessJamaat = (user, jamaatId) =>
  user.role === 'admin' || (user.role === 'teacher' && user.jamaatIds.includes(jamaatId));

// ব্যবহারকারী যেসব ছাত্রের তথ্য দেখতে পারে তাদের আইডি (অ্যাডমিন + জামাত ফিল্টার ছাড়া = null মানে সব)
async function visibleStudentIds(user, jamaatId) {
  if (user.role === 'admin' && !jamaatId) return null;
  const filter = {};
  if (user.role === 'teacher') filter.jamaatId = jamaatId ? (user.jamaatIds.includes(jamaatId) ? jamaatId : '__none__') : { $in: user.jamaatIds };
  else filter.jamaatId = jamaatId;
  return (await (await col('students')).find(filter, { projection: { _id: 1 } }).toArray()).map((s) => s._id);
}

module.exports = { sign, authenticate, requireRole, canAccessJamaat, visibleStudentIds };
