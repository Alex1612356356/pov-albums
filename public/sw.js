const CACHE_NAME = 'fdms-albums-static-v4';
const APP_ASSETS = ['/style.css', '/fdmsalb.png', '/pwa-icon-192.png', '/pwa-icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)),
    self.skipWaiting()
  ]));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !APP_ASSETS.includes(url.pathname)) return;
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
