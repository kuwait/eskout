// Minimal service worker — enables PWA install prompt
// No offline caching, no push notifications
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
