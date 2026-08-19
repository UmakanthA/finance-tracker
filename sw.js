/* Reckoning service worker.
   Purpose: make the app installable and usable offline.
   Strategy: network-first for the app shell (so you always get the latest
   deploy when you have signal), cache-first for static icons. */

const CACHE = 'reckoning-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './icon-180.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never intercept cross-origin (Google fonts, GSI client) — let the network handle it.
  if (url.origin !== self.location.origin) return;

  const isShell = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');

  if (isShell) {
    // Network-first: fresh app when online, cached app when not.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for icons and other same-origin static assets.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }))
  );
});

/* Local reminder relay.
   The page asks the SW to fire a notification while the app is open or
   recently backgrounded. This is NOT push — there is no server. It only
   fires if the browser has kept this worker alive. The calendar reminder
   is the dependable nudge; this is a bonus on Android/desktop. */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'reckoning-notify') {
    self.registration.showNotification(data.title || 'Reckoning', {
      body: data.body || 'Log what you spent today.',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'reckoning-daily',
      renotify: true,
      data: { url: './' }
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
