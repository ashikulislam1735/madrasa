const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { authenticate } = require('./auth');
const { HttpError } = require('./util');
const { db } = require('./db');

const app = express();
app.set('trust proxy', 1);
// CSP আপাতত বন্ধ: বর্তমান ফ্রন্টএন্ডে inline script/onclick আছে। ফ্রন্টএন্ড ভাগ করার পর চালু করুন।
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(config.corsOrigins.length ? { origin: config.corsOrigins } : { origin: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', async (_req, res) => {
  try { await (await db()).command({ ping: 1 }); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

app.use('/api', authenticate);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/public', require('./routes/public'));
app.use('/api', require('./routes/structure'));
app.use('/api/students', require('./routes/students'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api', require('./routes/content'));
app.use('/api', require('./routes/routine'));
app.use('/api/admissions', require('./routes/admissions'));
app.use('/api/guardian', require('./routes/guardian'));

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'পাওয়া যায়নি')));

// এই প্রজেক্ট শুধু API; ফ্রন্টএন্ড আলাদা প্রজেক্ট (madrasa-frontend)
app.get('/', (_req, res) => res.json({ name: 'madrasa-api', ok: true }));

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'JSON ফরম্যাট ভুল');
  if (err.type === 'entity.too.large') err = new HttpError(413, 'অনুরোধ অতিরিক্ত বড়');
  if (err.code === 11000) err = new HttpError(409, 'এই তথ্য আগে থেকেই আছে');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'সার্ভারে সমস্যা হয়েছে' : err.message });
});

module.exports = app;
