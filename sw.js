const VERSION = new URL(self.location).searchParams.get('v') || '2.120.4';
const CACHE_NAME = 'music-player-v' + VERSION;
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// Open IndexedDB from Service Worker
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('MusicPlayerDB', 3);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Get song blob from IndexedDB by ID — returns {blob, name}
function getSongBlob(id) {
    return openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['songs'], 'readonly');
            const store = tx.objectStore('songs');
            const req = store.get(id);
            req.onsuccess = () => {
                const song = req.result;
                // C7: Guard against corrupted records (missing or empty blob)
                if (song && song.blob && song.blob.size > 0) {
                    resolve({ blob: song.blob, name: song.name || '' });
                } else if (song && song.blob) {
                    reject(new Error('Song blob is empty (corrupted): ' + id));
                } else {
                    reject(new Error('Song not found: ' + id));
                }
            };
            req.onerror = () => reject(req.error);
        });
    });
}

// Guess MIME type from filename or blob
function guessMimeType(blob, name) {
    if (blob.type && blob.type !== '') return blob.type;
    if (!name) return 'audio/mpeg';
    const ext = name.split('.').pop().toLowerCase();
    const map = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'aac': 'audio/aac',
        'm4a': 'audio/mp4',
        'flac': 'audio/flac',
        'webm': 'audio/webm',
        'opus': 'audio/opus'
    };
    return map[ext] || 'audio/mpeg';
}

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Intercept audio/{songId} requests (scope-relative)
    const swScope = self.registration.scope;
    const requestPath = url.href;

    // Check if request URL matches {scope}audio/{id}
    if (requestPath.startsWith(swScope + 'audio/')) {
        const songIdStr = requestPath.substring((swScope + 'audio/').length);
        const songId = parseInt(songIdStr, 10);
        if (isNaN(songId)) {
            e.respondWith(new Response('Invalid song ID', { status: 400 }));
            return;
        }

        e.respondWith(
            getSongBlob(songId).then(({ blob, name }) => {
                const totalSize = blob.size;
                const contentType = guessMimeType(blob, name);
                const rangeHeader = e.request.headers.get('Range');

                if (rangeHeader) {
                    // Parse Range header: "bytes=start-end"
                    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
                    if (match) {
                        const start = parseInt(match[1], 10);
                        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
                        const chunkSize = end - start + 1;

                        const slicedBlob = blob.slice(start, end + 1, contentType);

                        return new Response(slicedBlob, {
                            status: 206,
                            statusText: 'Partial Content',
                            headers: {
                                'Content-Type': contentType,
                                'Content-Length': chunkSize.toString(),
                                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                                'Accept-Ranges': 'bytes',
                                'Cache-Control': 'no-cache'
                            }
                        });
                    }
                }

                // Full response (no Range header)
                return new Response(blob, {
                    status: 200,
                    headers: {
                        'Content-Type': contentType,
                        'Content-Length': totalSize.toString(),
                        'Accept-Ranges': 'bytes',
                        'Cache-Control': 'no-cache'
                    }
                });
            }).catch(err => {
                console.error('SW audio fetch error:', err);
                return new Response('Song not found', { status: 404 });
            })
        );
        return;
    }

    // Network-first strategy for HTML pages (like index.html) to ensure updates
    if (e.request.mode === 'navigate' || (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html'))) {
        e.respondWith(
            fetch(e.request)
                .then(response => {
                    // Cache the latest version
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseClone));
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if offline
                    return caches.match(e.request);
                })
        );
        return;
    }

    // Normal cache-first strategy for other assets (CSS, JS)
    e.respondWith(
        caches.match(e.request)
            .then(response => response || fetch(e.request))
    );
});
