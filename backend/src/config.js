// পরিবেশ ভেরিয়েবল থেকে কনফিগারেশন। .env ফাইল থাকলে (সাধারণ KEY=VALUE) পড়ে নেয়।
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const isProd = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || '';
if (isProd && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET অন্তত ৩২ অক্ষরের হতে হবে (production)।');
}

module.exports = {
  isProd,
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  mongoDb: process.env.MONGODB_DB || 'madrasa',
  jwtSecret: jwtSecret || 'dev-only-secret-change-me-dev-only-secret',
  jwtExpires: process.env.JWT_EXPIRES || '12h',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
};
