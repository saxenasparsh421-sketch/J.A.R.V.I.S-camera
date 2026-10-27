/* J.A.R.V.I.S PWA shell cache. AI runtimes/models use their own browser caches. */
const CACHE_NAME = 'jarvis-mobile-vision-shell-v2.0.0';
const APP_FILES = [
  './', './index.html', './styles.css', './app.js', './manifest.json',
  './icons/jarvis-192.png', './icons/jarvis-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_FILES);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('jarvis-mobile-vision-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Only cache this app's own shell; model caches are handled by the model runtimes.
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, {ignoreSearch: true});
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && (request.destination === 'script' || request.destination === 'style' || request.destination === 'document' || request.destination === 'image' || url.pathname.endsWith('.json'))) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      if (request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
