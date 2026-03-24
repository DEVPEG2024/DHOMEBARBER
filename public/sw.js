// D'Home Barber - Service Worker for Push Notifications + Offline Mode

const CACHE_NAME = 'dhome-v1';
const STORAGE_KEY = 'dhome_notifications';

// App shell files to cache for offline support
const APP_SHELL = [
  '/',
  '/index.html',
  '/logo.png',
  '/icon.png',
  '/manifest.json',
];

// ─── Install: cache app shell ────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ─── Activate: clean old caches ──────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch: network-first for API, cache-first for assets ───────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin && !url.hostname.includes('herokuapp.com')) return;

  // API requests: network-first with cache fallback (for offline agenda)
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache GET requests that succeed
          if (request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // App navigation: network-first, fallback to cached index.html (SPA)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

// ─── Push Notifications ──────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: "D'Home Barber", body: 'Nouvelle notification' };

  try {
    data = event.data.json();
  } catch {
    data.body = event.data?.text() || data.body;
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || '/icon.png',
        badge: data.badge || '/icon.png',
        data: { url: data.data?.url || '/notifications', title: data.title, body: data.body },
        vibrate: [200, 100, 200],
      }),
      storeAndBadge(data),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        client.postMessage({ type: 'REFRESH_BADGE' });
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// Store notification and update badge count
async function storeAndBadge(data) {
  const allClients = await clients.matchAll({ includeUncontrolled: true });
  for (const client of allClients) {
    client.postMessage({
      type: 'PUSH_RECEIVED',
      notification: { title: data.title, body: data.body },
    });
  }

  if (navigator.setAppBadge) {
    if (allClients.length > 0) {
      allClients[0].postMessage({ type: 'GET_BADGE_COUNT' });
    } else {
      navigator.setAppBadge(1);
    }
  }
}

// Listen for badge count responses from clients
self.addEventListener('message', (event) => {
  if (event.data?.type === 'BADGE_COUNT') {
    const count = event.data.count || 0;
    if (count > 0 && navigator.setAppBadge) {
      navigator.setAppBadge(count);
    } else if (navigator.clearAppBadge) {
      navigator.clearAppBadge();
    }
  }
});
