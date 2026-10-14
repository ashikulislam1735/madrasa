# মাদরাসা ব্যাকএন্ড (Node.js + MongoDB)

শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা অ্যাপের জন্য আলাদা সার্ভার ও ডেটাবেজ। আগে সব ডেটা Firebase-এ একটি বড় JSON ছিল এবং অ্যাডমিন পাসওয়ার্ড ফ্রন্টএন্ড কোডে লেখা ছিল। এখন ডেটা টেবিলে ভাগ করা, লগইন সার্ভারে যাচাই হয় এবং ভূমিকা অনুযায়ী অনুমতি আছে।

## ফোল্ডার
| পথ | কী আছে |
|---|---|
| `src/` | Express API (`routes/` এ প্রতিটি অংশ আলাদা), `db.js` MongoDB সংযোগ ও ইনডেক্স |
| `scripts/` | `init-db` (ইনডেক্স + ডিফল্ট জামাত), `create-admin` |
| `test/api.test.js` | ১২টি স্বয়ংক্রিয় API টেস্ট |
| `test/e2e_browser.py` | সত্যিকারের ব্রাউজারে পুরো ফ্লো যাচাই (Playwright লাগে) |
| `frontend/` | `index.html`, `style.css`, `app.js`, `api.js` (API ক্লায়েন্ট), `sync.js`, `config.js` |
| `render.yaml`, `vercel.json` | Render ও Vercel ডিপ্লয় কনফিগ |

## ডেটাবেজ: MongoDB
কালেকশন: `branches, jamaats, users, students, attendance, examResults, feePayments, expenses, notices, holidays, boardResults, competitionResults, admissions, counters`।
সবচেয়ে সহজ: **MongoDB Atlas**-এর ফ্রি M0 ক্লাস্টার (৫১২ MB, বিনা খরচে, মেয়াদ শেষ হয় না — প্ল্যানের শর্ত Atlas-এর সাইটে দেখে নিন)। Atlas-এ Database Access-এ একজন ইউজার বানান, Network Access-এ `0.0.0.0/0` দিন (Render-এর IP বদলায়), তারপর Connect → Drivers থেকে connection string নিন।

## লোকালি চালানো
```bash
npm install
cp .env.example .env      # MONGODB_URI ও JWT_SECRET বসান
npm run db:init
ADMIN_MOBILE=01XXXXXXXXX ADMIN_PASSWORD='কমপক্ষে৮অক্ষর' npm run create-admin
npm start                 # http://localhost:3000
```
Docker-এ (নিজের সার্ভারে, MongoDB সহ): `docker compose up -d --build`, তারপর `docker compose exec -e ADMIN_MOBILE=… -e ADMIN_PASSWORD=… api node scripts/create-admin.js`। দৈনিক ব্যাকআপ `backups/` ফোল্ডারে জমা হয়।

## ভূমিকা ও অনুমতি
| ভূমিকা | লগইন | কী পারে |
|---|---|---|
| অ্যাডমিন | মোবাইল + পাসওয়ার্ড | সবকিছু: শিক্ষক নিয়োগ, বেতন/খরচ, ভর্তি অনুমোদন, নোটিশ, ফলাফল |
| শিক্ষক | মোবাইল + পাসওয়ার্ড (নিজে সাইনআপ) | অ্যাডমিন জামাত যুক্ত করার পর শুধু **নিজের জামাতের** ছাত্র, হাজিরা, পরীক্ষার নম্বর |
| অভিভাবক | ছাত্র আইডি + অভিভাবকের মোবাইল | শুধু **নিজের সন্তানের** তথ্য (হাজিরা, রেজাল্ট, বেতন) |
| সবাই (লগইন ছাড়া) | — | নোটিশ, ছুটি, বোর্ড/প্রতিযোগিতার ফলাফল, ভর্তির আবেদন জমা |

আগে অভিভাবক শুধু নাম লিখে যে কারো তথ্য দেখতে পারত; এখন আইডি ও মোবাইল দুটোই মিলতে হয়।

## API সংক্ষেপে (`/api` এর পরে)
* `auth/login`, `auth/teacher/signup`, `auth/guardian`, `auth/me`, `auth/change-password`
* `public/overview`, `branches`, `jamaats`, `notices`, `holidays`, `board-results`, `competition-results`
* `students` (CRUD), `attendance` (`GET ?date=` বা `?month=`, `PUT` বাল্ক), `exams`
* `accounts/fees`, `accounts/expenses`, `accounts/summary?month=` (শুধু অ্যাডমিন)
* `admissions` (POST পাবলিক; তালিকা/`/:id/approve`/`/:id/reject` অ্যাডমিন; অনুমোদনে ছাত্র স্বয়ংক্রিয় তৈরি হয়)
* `teachers`, `jamaats/:id/teachers` (অ্যাডমিন)
* `guardian/me`

`frontend/api.js` এ প্রতিটি কলের জন্য রেডিমেড ফাংশন আছে।

## ফ্রন্টএন্ড (এখন API-তে যুক্ত, Firebase আর লাগে না)
* `frontend/app.js` থেকে Firebase সরানো হয়েছে। লগইন (অ্যাডমিন/শিক্ষক/অভিভাবক), ছাত্র, হাজিরা, নম্বর, বেতন, খরচ, নোটিশ, ভর্তি সবই API দিয়ে চলে।
* `frontend/sync.js`: আগের `data` অবজেক্ট রাখা হয়েছে, কিন্তু সেভের সময় শুধু বদলানো অংশ সার্ভারে যায় (তাই পুরো ডেটা ওভাররাইট হয় না)।
* অ্যাডমিন লগইন এখন **মোবাইল + পাসওয়ার্ড** (প্রথমে `npm run create-admin`)।
* অভিভাবক এখন **ছাত্র আইডি + অভিভাবকের মোবাইল** দিয়ে দেখেন (শিক্ষক/অ্যাডমিন ছাত্রের তথ্যে অভিভাবকের মোবাইল দিয়ে রাখবেন)।
* ছাত্র আইডি এখন সার্ভার দেয় (ডুপ্লিকেট হয় না)।

**সীমাবদ্ধতা:**
* শুরুতে হাজিরা ও বেতনের **শেষ ১২ মাস** লোড হয় (`sync.js`-এর `RANGE_MONTHS`)। এর আগের মাসের ডেটা এখনো স্ক্রিনে আসে না।
* "মাদ্রাসার ফলাফল" স্ক্রিন আগে সবাই দেখত; এখন নম্বর শুধু লগইন করা ব্যবহারকারী/অভিভাবক (নিজের সন্তানের) দেখে।
* একাধিক ডিভাইসে একসাথে কাজ করলে অন্যের পরিবর্তন রিফ্রেশ ছাড়া দেখা যায় না।
* বাংলাদেশের জেলা/উপজেলা তালিকা এখনো CDN থেকে আসে।
* `test/e2e_browser.py` সত্যিকারের ব্রাউজারে এই ফ্লো যাচাই করে (Playwright লাগে)।

পুরনো Firebase প্রজেক্টের ডেটাবেজ রুল `{".read":false,".write":false}` করে দিন (অথবা প্রজেক্ট মুছে দিন)।

## নিরাপত্তা নোট
* `JWT_SECRET` গোপন রাখুন; production-এ ৩২ অক্ষরের কম হলে সার্ভার চালুই হয় না।
* HTTPS অবশ্যই ব্যবহার করুন (Caddy/Nginx/Cloudflare)।
* অ্যাডমিন পাসওয়ার্ড ও `teacher-passwords.csv` কারো সাথে শেয়ার করবেন না।
* ফ্রন্টএন্ডে inline `onclick` থাকায় CSP আপাতত বন্ধ (`src/app.js`)। ফ্রন্টএন্ড পুরোপুরি বদলানোর পর চালু করুন।
* টেস্ট চালাতে: `TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test` (সতর্কতা: `madrasa_test` ডেটাবেজ মুছে নতুন করে বানায়)।
