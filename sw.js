// KafeStok — çevrimdışı önbellek
const CACHE = 'kafestok-v25';
const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
const FILES = ['./', 'index.html', 'style.css', 'store.js', 'app.js', 'vendor/compat.js', 'vendor/qr.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-180.png', 'logo.png', 'config.js', 'sync.js', 'firebase-backend.js', 'rest-backend.js'];
// okuyucu kütüphanesini de önbelleğe almaya çalış (internet yoksa sorun değil)
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.add(JSQR)).catch(() => {})));
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});

// bildirime dokununca uygulamayı aç ve ilgili ekrana git
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(x => x.url.startsWith(self.registration.scope));
    if (c) return c.navigate(url).then(w => (w || c).focus()).catch(() => c.focus());
    return self.clients.openWindow(url);
  }));
});
