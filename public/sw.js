// D'Home Barber - Service Worker for Push Notifications + Offline Mode

// v2 : le cache v1 contenait des réponses authentifiées (dont /me) ; changer le nom le
// fait supprimer à l'activation (voir « activate »).
// v3 : l'index en cache est rafraîchi à chaque ouverture réussie et les images /api/media
// ne sont plus gardées ici (le cache HTTP d'un an du serveur suffit) ; le changement de nom
// purge l'ancien cache, images accumulées comprises.
const CACHE_NAME = 'dhome-v3';

// Fichiers du build (/assets/, noms à empreinte donc immuables) : sans eux, l'app installée
// ouverte hors ligne restait sur une page vide au lieu de l'écran « Pas de connexion
// internet ». Cache séparé, conservé d'une version du service worker à l'autre, plafonné
// pour ne pas grossir sans fin d'un déploiement à l'autre (les plus anciens partent).
const ASSET_CACHE = 'dhome-assets-v1';
const ASSET_MAX = 160; // un build compte ~80 fichiers : de quoi garder le précédent
const KEPT_CACHES = [CACHE_NAME, ASSET_CACHE];

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

function isBuildAsset(request, url) {
  return request.method === 'GET'
    && url.origin === self.location.origin
    && url.pathname.startsWith('/assets/');
}

// Fichiers /assets/ cités par un index (script principal, feuille de style)
function entryAssetPaths(html) {
  return [...new Set(String(html || '').match(/\/assets\/[^"'\s<>)]+/g) || [])];
}

// Garde les ASSET_MAX entrées les plus récentes (cache.keys() suit l'ordre d'insertion),
// sans jamais retirer les fichiers d'entrée de l'index en cache : ce sont eux qui démarrent
// l'app hors ligne
function trimAssetCache(cache) {
  return cache.keys().then((keys) => {
    if (keys.length <= ASSET_MAX) return undefined;
    return caches.match('/index.html', { cacheName: CACHE_NAME })
      .then((index) => (index ? index.text() : ''))
      .catch(() => '')
      .then((html) => {
        const keep = new Set(entryAssetPaths(html));
        const removable = keys.filter((key) => !keep.has(new URL(key.url).pathname));
        const extra = keys.length - ASSET_MAX;
        return Promise.all(removable.slice(0, extra).map((key) => cache.delete(key)));
      });
  }).catch(() => {});
}

// Fichiers d'entrée cités par l'index (script principal, feuille de style) : sans eux la
// première ouverture hors ligne après l'installation échouerait encore. Seuls les fichiers
// absents du cache sont téléchargés. Jamais bloquant.
function precacheEntryAssets(indexResponse) {
  if (!indexResponse) return Promise.resolve();
  return indexResponse.text()
    .then((html) => {
      const paths = entryAssetPaths(html);
      if (paths.length === 0) return undefined;
      return caches.open(ASSET_CACHE).then((cache) =>
        Promise.all(paths.map((path) => cache.match(path).then((hit) => (hit ? null : path))))
          .then((missing) => missing.filter(Boolean))
          .then((missing) => (missing.length ? cache.addAll(missing).then(() => trimAssetCache(cache)) : undefined))
      );
    })
    .catch(() => {});
}

// Prolonge la vie du service worker le temps d'un rangement en cache, sans jamais faire
// échouer la réponse si le navigateur refuse (événement déjà terminé)
function keepAlive(event, promise) {
  const safe = Promise.resolve(promise).catch(() => {});
  try { event.waitUntil(safe); } catch { /* rangement laissé en tâche de fond */ }
}

// ─── Install: cache app shell ────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).then(() => cache.match('/index.html')))
      .then(precacheEntryAssets)
  );
  self.skipWaiting();
});

// ─── Activate: clean old caches ──────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !KEPT_CACHES.includes(k)).map((k) => caches.delete(k)))
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

  // Images servies par l'API : le cache HTTP du navigateur suffit (Cache-Control d'un an, ETag)
  if (url.pathname.includes('/api/media/')) return;

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
  // L'index gardé est remplacé à chaque ouverture réussie : celui figé à l'installation citait,
  // après un déploiement, des fichiers /assets/ qui n'existent plus. Seul l'index de l'app est
  // rangé : /cgu.html, /privacy.html (vrais fichiers, avec extension) ou une redirection, jamais.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const isAppIndex = response.ok
            && !response.redirected
            && !/\.[a-z0-9]+$/i.test(url.pathname.replace(/\/index\.html$/, '/'))
            && (response.headers.get('content-type') || '').includes('text/html');
          if (isAppIndex) {
            const clone = response.clone();
            keepAlive(event,
              caches.open(CACHE_NAME)
                .then((cache) => cache.put('/index.html', clone.clone()).then(() => clone))
                .then(precacheEntryAssets)
            );
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Fichiers du build : cache d'abord (noms à empreinte), sinon réseau puis rangement
  if (isBuildAsset(request, url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          // Réponse en échec (404 d'un onglet périmé gardé « immuable » un an par le cache HTTP) :
          // un seul nouvel essai qui contourne ce cache et remplace son entrée, sinon un fichier
          // revenu après un retour arrière de déploiement resterait introuvable dans ce navigateur
          return fetch(request)
            .then((response) => (response.ok
              ? response
              : fetch(request.url, { cache: 'reload', credentials: 'same-origin' }).catch(() => response)))
            .then((response) => {
              if (response.ok) {
                const clone = response.clone();
                keepAlive(event, cache.put(request, clone).then(() => trimAssetCache(cache)));
              }
              return response;
            });
        })
      )
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
        // Tag envoyé par le serveur (seulement les messages fusionnables, COLLAPSIBLE_TAGS de
        // pushHelper) : la nouvelle notification remplace l'ancienne du même tag, avec son et
        // vibration (renotify)
        ...(typeof data.tag === 'string' && data.tag ? { tag: data.tag.slice(0, 64), renotify: true } : {}),
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
