const CACHE_NAME = 'simple-chat-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/chat.html',
  '/login.html',
  '/style.css',
  '/style2.css',
  '/firebase.js',
  '/favicon.ico',
  '/icon/icon-192x192.png',
  '/icon/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }
  
  if (event.request.url.includes('.firebaseio.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }

        return fetch(event.request).then(
          (response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );

});
