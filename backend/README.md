# Backend (API) — Node.js + Express + MongoDB

## ফোল্ডার
`src/` API কোড (`routes/` এ প্রতিটি অংশ) · `scripts/` `init-db`, `create-admin` · `test/` স্বয়ংক্রিয় টেস্ট

## পরিবেশ ভেরিয়েবল (`.env.example`)
| নাম | মান |
|---|---|
| `MONGODB_URI` | Atlas-এর connection string |
| `MONGODB_DB` | `madrasa` |
| `JWT_SECRET` | ৩২+ অক্ষরের গোপন লেখা (`openssl rand -hex 32`) |
| `CORS_ORIGINS` | ফ্রন্টএন্ডের ঠিকানা (কমা দিয়ে একাধিক)। না দিলে ফ্রন্টএন্ড API-তে ঢুকতে পারবে না |

## লোকালি চালানো
```bash
npm install
cp .env.example .env
npm run db:init
ADMIN_MOBILE=01XXXXXXXXX ADMIN_PASSWORD='কমপক্ষে৮অক্ষর' npm run create-admin
npm start        # http://localhost:3000/api/health
```

## ভূমিকা
| ভূমিকা | লগইন | কী পারে |
|---|---|---|
| অ্যাডমিন | মোবাইল + পাসওয়ার্ড | সবকিছু |
| শিক্ষক | মোবাইল + পাসওয়ার্ড (নিজে সাইনআপ) | অ্যাডমিন জামাত যুক্ত করার পর শুধু নিজের জামাত |
| অভিভাবক | ছাত্র আইডি + অভিভাবকের মোবাইল | শুধু নিজের সন্তানের তথ্য |

## টেস্ট
`TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test` (সতর্কতা: `madrasa_test` ডেটাবেজ মুছে নতুন করে বানায়)

`JWT_SECRET` ও `MONGODB_URI` কখনো GitHub-এ তুলবেন না।
