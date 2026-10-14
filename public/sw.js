// D'Home Barber - Service Worker for Push Notifications + Offline Mode

// v2 : le cache v1 contenait des réponses authentifiées (dont /me) ; changer le nom le
// fait supprimer à l'activation (voir « activate »).
const CACHE_NAME = 'dhome-v2';

// Centre de notifications : chaque push reçu est rangé ici (IndexedDB, le service worker n'a
// pas accès au localStorage), même app fermée. L'app le rattache au compte connecté à
// l'ouverture de la page Notifications (syncServiceWorkerNotifications, pushNotifications.js).
// Même nom, même version et même magasin que côté app.
const NOTIF_DB = 'dhb-notifs';
const NOTIF_STORE = 'items';
const NOTIF_MAX = 50;

// App shell files to cache for offline support
const APP_SHELL = [
  '/',
  '/index.html',
  '/logo.png',
  '/icons/icon-192.png',
  '/manifest.json',
];

// Seules les réponses publiques de l'API sont gardées pour le hors-ligne. Une requête qui
// porte un jeton dépend du compte, or le cache n'a que l'URL pour clé : sur un appareil
// partagé, hors ligne, on revoyait les données du compte précédent (/me compris).
function isPublicApiRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (request.headers.has('Authorization')) return false;
  if (url.pathname.includes('/auth/') || /\/entities\/User\/me\/?$/.test(url.pathname)) return false;
  return true;
}

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

  // API requests: network-first with cache fallback, public responses only
  if (url.pathname.includes('/api/')) {
    // Requête authentifiée ou d'authentification : le navigateur s'en charge, rien n'est gardé
    if (!isPublicApiRequest(request, url)) return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache GET requests that succeed
          if (response.ok) {
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
    data = event.data.json() || data;
  } catch {
    data.body = event.data?.text() || data.body;
  }
  const title = data.title || "D'Home Barber";
  const body = data.body || '';

  // Identifiant commun à l'IndexedDB et au message envoyé à l'app ouverte : la fusion
  // ultérieure ne la compte pas deux fois
  const entry = {
    id: `sw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    body,
    url: typeof data.data?.url === 'string' ? data.data.url : null,
    date: new Date().toISOString(),
    read: false,
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon: data.icon || '/icons/icon-192.png',
        badge: data.badge || '/icons/icon-96.png',
        data: { url: data.data?.url || '/notifications', title, body },
        vibrate: [200, 100, 200],
      }),
      storeAndBadge(entry),
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

// Ouvre la base des notifications ; null si IndexedDB est absente ou refuse (jamais d'erreur)
function openNotifDb() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) { resolve(null); return; }
      const req = indexedDB.open(NOTIF_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(NOTIF_STORE)) {
          req.result.createObjectStore(NOTIF_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// Range la notification (50 au plus, les plus anciennes partent) ; renvoie le nombre en attente
async function saveNotification(entry) {
  const db = await openNotifDb();
  if (!db) return 0;
  return new Promise((resolve) => {
    let pending = 0;
    const finish = (value) => { try { db.close(); } catch { /* déjà fermée */ } resolve(value); };
    try {
      const tx = db.transaction(NOTIF_STORE, 'readwrite');
      const store = tx.objectStore(NOTIF_STORE);
      store.put(entry);
      const all = store.getAll();
      all.onsuccess = () => {
        const items = (all.result || []).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        items.slice(NOTIF_MAX).forEach((item) => store.delete(item.id));
        pending = Math.min(items.length, NOTIF_MAX);
      };
      tx.oncomplete = () => finish(pending);
      tx.onerror = () => finish(0);
      tx.onabort = () => finish(0);
    } catch {
      finish(0);
    }
  });
}

// Store notification and update badge count
async function storeAndBadge(entry) {
  const pending = await saveNotification(entry);
  const allClients = await clients.matchAll({ includeUncontrolled: true });
  for (const client of allClients) {
    client.postMessage({ type: 'PUSH_RECEIVED', notification: entry });
  }

  if (navigator.setAppBadge) {
    if (allClients.length > 0) {
      allClients[0].postMessage({ type: 'GET_BADGE_COUNT' });
    } else {
      try { Promise.resolve(navigator.setAppBadge(Math.max(1, pending))).catch(() => {}); } catch { /* pastille non gérée */ }
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
