const CACHE_NAME = 'pelfin-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/variables.css',
  '/css/main.css',
  '/css/auth.css',
  '/css/dashboard.css',
  '/css/coach.css',
  '/js/api.js',
  '/js/app.js',
  '/js/dashboard.js',
  '/js/expenses.js',
  '/js/budgets.js',
  '/js/goals.js',
  '/js/coach.js',
  '/js/notifications.js',
  '/icon.svg',
  '/favicon.ico'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Skip caching for backend API requests to ensure real-time updates
  if (e.request.url.includes('/api/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
