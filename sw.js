const CACHE_NAME = 'music-player-v10';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
];

self.addEventListener('install', (e) => {
    self.skipWaiting(); // Force new SW to activate immediately
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim()); // Take control of all clients immediately
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request)
            .then(response => response || fetch(e.request))
    );
});
