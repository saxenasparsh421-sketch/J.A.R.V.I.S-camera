'use strict';
const CACHE_NAME = 'jarvis-mobile-hud-v1';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icons/jarvis-192.png', './icons/jarvis-512.png'];
const MODEL_HOSTS = ['cdn.jsdelivr.net', 'storage.googleapis.com'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('jarvis-mobile-hud-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {}); }
        return response;
      }).catch(() => caches.match('./index.html'));
    }));
    return;
  }
  // The optional AI engine/model may be cached by the browser after a successful CORS fetch.
  // Avoid storing opaque or error responses; quota failures are intentionally ignored.
  if (MODEL_HOSTS.includes(url.hostname) && (request.destination === 'script' || request.destination === 'worker' || url.pathname.endsWith('.tflite') || url.pathname.endsWith('.wasm') || url.pathname.endsWith('.mjs') || url.pathname.endsWith('.js'))) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response && response.ok && response.type !== 'opaque') cache.put(request, response.clone()).catch(() => {});
      return response;
    }).catch(() => new Response('AI resource unavailable offline. Connect to the internet and retry.', {status: 503, headers: {'Content-Type':'text/plain; charset=utf-8'}})));
  }
});
