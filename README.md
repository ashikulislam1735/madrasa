# শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা অ্যাপ

```
madrasa-app/
├── backend/    Node.js + Express API  (MongoDB)   → Render-এ চলে
├── frontend/   HTML/CSS/JS অ্যাপ (ফোনে ইনস্টলযোগ্য) → Vercel-এ চলে
├── render.yaml         Render ডিপ্লয় কনফিগ
└── docker-compose.yml  নিজের সার্ভারে চালানোর বিকল্প
```

## লাইভ করার ধাপ
**১. MongoDB Atlas:** ফ্রি M0 ক্লাস্টার → Database Access-এ ইউজার (Read and write to any database) → Network Access-এ `0.0.0.0/0` → Connect → Drivers থেকে connection string।

**২. GitHub:** এই পুরো ফোল্ডার একটা private রিপোতে তুলুন (`backend/`, `frontend/`, `render.yaml` রিপোর সবচেয়ে ওপরে থাকবে)।

**৩. Render (backend):** New → Blueprint → রিপো বাছুন। `MONGODB_URI`-তে Atlas-এর লাইন বসান, `CORS_ORIGINS` আপাতত খালি রাখুন। ডিপ্লয় শেষে `…onrender.com/api/health` খুলে `{"ok":true}` দেখুন।

**৪. অ্যাডমিন বানান** (লোকাল কম্পিউটারে `backend/` ফোল্ডারে, `npm install` করে):
```bash
MONGODB_URI='mongodb+srv://…' ADMIN_MOBILE=01XXXXXXXXX ADMIN_PASSWORD='কমপক্ষে৮অক্ষর' npm run create-admin
```

**৫. frontend:** `frontend/config.js`-এ Render-এর ঠিকানা বসান (`window.API_BASE = 'https://….onrender.com'`), কমিট করুন।

**৬. Vercel (frontend):** Add New → Project → রিপো বাছুন → **Root Directory: `frontend`** → Framework: Other → Deploy।

**৭.** Vercel-এর ঠিকানা কপি করে Render-এর `CORS_ORIGINS`-এ বসান (নইলে লগইন কাজ করবে না)।

আরও বিস্তারিত: `backend/README.md`।
