// ============================================================
//  Sky Watcher — sw.js  (Service Worker)
//  ทำให้เปิดได้แบบ offline + ติดตั้งเป็นแอปได้
// ============================================================

const CACHE_NAME = 'skywatcher-v1';

// ไฟล์ที่จะ cache ไว้ใช้ offline
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=Outfit:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/mqtt/5.3.4/mqtt.min.js',
];

// ติดตั้ง — cache ไฟล์ทั้งหมด
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — ลบ cache เก่า
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — เสิร์ฟจาก cache ก่อน ถ้าไม่มีค่อยดึง network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});