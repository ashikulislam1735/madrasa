// শায়খুল ইসলাম হিফজুল কোরআন মাদরাসা — Service Worker
// শুধু অ্যাপের নিজস্ব ফাইল (HTML/CSS/JS/ছবি) ক্যাশ হয়, যাতে ইনস্টল করা যায় ও নেটওয়ার্ক না থাকলে খোলে।
// API-র উত্তর (ছাত্র, বেতন ইত্যাদি ব্যক্তিগত তথ্য) কখনো ক্যাশ হয় না।
const CACHE_NAME = 'shaykhul-islam-madrasa-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(req)
      .then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE_NAME).then((ch) => ch.put(req, c)); } return res; })
      .catch(() => caches.match(req))
  );
});
