import { apiRequest, apiUrl, getToken } from '@/api/apiClient';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const isNative = Capacitor.isNativePlatform();

// Jeton de l'appareil (FCM sur Android, APNs sur iOS). Il peut arriver avant la connexion
// (renouvellement au lancement, autorisation donnée hors session) : le serveur le refusait
// alors en 401 et plus rien ne le renvoyait, le client ne recevait jamais aucune notification.
// On le garde donc ici et il part dès qu'une session est ouverte (voir syncPushSubscription).
const NATIVE_TOKEN_KEY = 'dhb-native-push-token';
// Désactivation volontaire dans Paramètres : l'appareil n'est plus réabonné au lancement.
const PUSH_OPTOUT_KEY = 'dhb-push-optout';

function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocal(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* stockage indisponible */ }
}

// Dernier couple session + jeton envoyé : évite de renvoyer deux fois le même jeton
// (jeton déjà connu envoyé, puis le même rendu par l'événement « registration »).
let lastSentNative = null;

// Envoie le jeton natif au serveur, seulement avec une session (sinon 401 garanti) ;
// sans session il reste en attente dans le stockage local.
async function sendNativeToken(token) {
  const session = getToken();
  if (!token || !session) return false;
  const key = `${session}|${token}`;
  if (lastSentNative === key) return true;
  try {
    await apiRequest('POST', apiUrl('/push/subscribe-native'), {
      token,
      platform: Capacitor.getPlatform(),
    });
    lastSentNative = key;
    return true;
  } catch {
    // Réseau ou session : renvoyé à la prochaine ouverture de session
    return false;
  }
}

// Get VAPID public key from backend
export async function getVapidPublicKey() {
  const data = await apiRequest('GET', apiUrl('/push/vapid-key'));
  return data.publicKey;
}

// Check if push is supported
export function isPushSupported() {
  if (isNative) return true;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * État de l'autorisation des notifications sur cet appareil, sans rien demander :
 * - `granted` : accordée ; `denied` : refusée (ne se rouvre que dans les réglages du téléphone) ;
 * - `prompt` : jamais demandée (la fenêtre système peut encore s'afficher) ;
 * - `optout` : désactivée volontairement dans Paramètres de l'app ; `unsupported` : pas de push ici.
 */
export async function getPushPermission() {
  if (!isPushSupported()) return 'unsupported';
  if (isNative) {
    if (readLocal(PUSH_OPTOUT_KEY) === '1') return 'optout';
    try {
      const { receive } = await PushNotifications.checkPermissions();
      if (receive === 'granted') return 'granted';
      if (receive === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

// Check if already subscribed
export async function isSubscribed() {
  if (!isPushSupported()) return false;
  if (isNative) {
    if (readLocal(PUSH_OPTOUT_KEY) === '1') return false;
    const permStatus = await PushNotifications.checkPermissions();
    return permStatus.receive === 'granted';
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

// Subscribe to push notifications
export async function subscribeToPush() {
  if (!isPushSupported()) throw new Error('Push non supporté');

  if (isNative) {
    return subscribeNativePush();
  }
  return subscribeWebPush();
}

// Native push (iOS/Android via Capacitor)
async function subscribeNativePush() {
  await initNativePush();
  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
    permStatus = await PushNotifications.requestPermissions();
  }
  if (permStatus.receive !== 'granted') {
    throw new Error('Permission push refusée');
  }
  writeLocal(PUSH_OPTOUT_KEY, null);
  // Le jeton arrive par l'événement « registration » (voir initNativePush) : envoyé tout
  // de suite avec une session, gardé pour la connexion sinon.
  await PushNotifications.register();
  return true;
}

// Setup native push listeners (call once at app startup)
let nativeListeners = null;
export function initNativePush() {
  if (!isNative) return Promise.resolve();
  if (nativeListeners) return nativeListeners;

  nativeListeners = Promise.all([
    // Jeton obtenu (ou renouvelé) : gardé, puis envoyé si une session est ouverte
    PushNotifications.addListener('registration', async (token) => {
      writeLocal(NATIVE_TOKEN_KEY, token.value);
      await sendNativeToken(token.value);
    }),

    // Registration error
    PushNotifications.addListener('registrationError', (error) => {
      console.warn('Push registration failed:', error);
    }),

    // Notification reçue app ouverte : rangée dans le centre de notifications du compte
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      addNotification(nativeEntry(notification));
    }),

    // Notification touchée : ouvre la page visée. L'app utilise des URL classiques
    // (BrowserRouter) : changer le « hash » ne faisait rien. pushState + popstate
    // fait suivre le routeur sans recharger l'app.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      // Reçue app fermée ou en arrière-plan : « pushNotificationReceived » n'a rien vu, on la
      // range ici (dédoublonnée si elle avait déjà été reçue au premier plan).
      addNotification({ ...nativeEntry(action.notification), read: true });
      const url = action.notification?.data?.url;
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
        window.history.pushState({}, '', url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }),
  ]).catch((err) => {
    console.warn('Push listeners failed:', err);
  });
  return nativeListeners;
}

/**
 * À appeler à chaque ouverture de session : lancement avec une session valide, connexion,
 * inscription (AuthContext). Rattache l'abonnement de l'appareil au compte connecté :
 * - rattrape le jeton obtenu avant la connexion (refusé en 401, jamais renvoyé jusqu'ici) ;
 * - rattrape les clients déjà touchés : autorisation accordée mais jeton jamais enregistré ;
 * - réattribue l'appareil quand un autre compte s'y connecte.
 * Ne demande jamais d'autorisation et ne crée pas d'abonnement web sans geste de l'utilisateur.
 */
let syncing = null;
export function syncPushSubscription() {
  if (!syncing) {
    syncing = doSyncPushSubscription().finally(() => { syncing = null; });
  }
  return syncing;
}

async function doSyncPushSubscription() {
  if (!getToken()) return;
  try {
    if (isNative) {
      if (readLocal(PUSH_OPTOUT_KEY) === '1') return;
      await initNativePush();
      const permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive !== 'granted') return;
      // Jeton gardé (obtenu hors session) : envoyé tout de suite
      await sendNativeToken(readLocal(NATIVE_TOKEN_KEY));
      // Puis jeton courant : FCM / APNs le renouvellent, et les installations qui ne l'ont
      // jamais gardé le récupèrent ici. Pas de demande d'autorisation (déjà accordée).
      await PushNotifications.register();
      return;
    }
    // Web : renvoie l'abonnement existant du navigateur (resté sans compte si la
    // notification a été activée hors session, ou appartenant au compte précédent)
    if (!('serviceWorker' in navigator) || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    const subscription = await reg?.pushManager?.getSubscription();
    if (subscription) {
      await apiRequest('POST', apiUrl('/push/subscribe'), subscription.toJSON());
    }
  } catch {
    // Meilleur effort : nouvelle tentative à la prochaine ouverture de session
  }
}

// Web push (PWA via Service Worker)
async function subscribeWebPush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permission refusée');

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) throw new Error('Clé VAPID non configurée');

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  // Sans session, le serveur refuserait (401) : l'abonnement reste dans le navigateur
  // et syncPushSubscription l'enregistre à la connexion.
  if (getToken()) {
    await apiRequest('POST', apiUrl('/push/subscribe'), subscription.toJSON());
  }
  return true;
}

/**
 * Déconnexion : le serveur oublie cet appareil pour le compte qui s'en va (sinon ses rappels
 * et last minute continuaient d'arriver sur un téléphone où il n'est plus connecté).
 * Contrairement à `unsubscribeFromPush`, ce n'est pas un refus : ni `dhb-push-optout`, ni
 * révocation du jeton natif, ni suppression de l'abonnement du navigateur — la prochaine
 * connexion le rattache au nouveau compte (syncPushSubscription). Meilleur effort, sans erreur.
 */
export async function detachPushFromAccount() {
  if (!getToken()) return;
  try {
    if (isNative) {
      const token = readLocal(NATIVE_TOKEN_KEY);
      lastSentNative = null;
      if (!token) return;
      await apiRequest('POST', apiUrl('/push/unsubscribe'), {
        endpoint: `native://${Capacitor.getPlatform()}/${token}`,
      });
      return;
    }
    if (!('serviceWorker' in navigator)) return;
    // getRegistration (et pas `ready`, qui attend indéfiniment sans service worker)
    const reg = await navigator.serviceWorker.getRegistration();
    const subscription = await reg?.pushManager?.getSubscription();
    if (subscription) {
      await apiRequest('POST', apiUrl('/push/unsubscribe'), { endpoint: subscription.endpoint });
    }
  } catch {
    // Réseau, session déjà expirée : rien à faire, la déconnexion continue
  }
}

// Unsubscribe from push
export async function unsubscribeFromPush() {
  if (isNative) {
    // Désactivation réelle : le serveur oublie l'appareil, le jeton est révoqué et le
    // lancement suivant ne réabonne pas (avant : seuls les écouteurs étaient retirés,
    // le serveur continuait d'envoyer et une réactivation n'envoyait plus le jeton).
    writeLocal(PUSH_OPTOUT_KEY, '1');
    const token = readLocal(NATIVE_TOKEN_KEY);
    if (token && getToken()) {
      try {
        await apiRequest('POST', apiUrl('/push/unsubscribe'), {
          endpoint: `native://${Capacitor.getPlatform()}/${token}`,
        });
      } catch {}
    }
    try { await PushNotifications.unregister(); } catch {}
    writeLocal(NATIVE_TOKEN_KEY, null);
    lastSentNative = null;
    return;
  }

  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();

  if (subscription) {
    try {
      await apiRequest('POST', apiUrl('/push/unsubscribe'), { endpoint: subscription.endpoint });
    } catch {}
    await subscription.unsubscribe();
  }
}

// Helper: convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ─── Centre de notifications (page /notifications) ───────────────────
// Les notifications reçues sont rangées sur l'appareil, par compte : `dhome_notifications:<id>`.
// Avant, une seule liste commune à l'appareil : après un changement de compte, le suivant
// lisait les notifications du précédent. Le compte courant est retenu dans `dhb-notif-owner`
// (posé par AuthContext) car une notification peut arriver avant la fin de la vérification de
// session, au lancement de l'app depuis la notification elle-même.
// Sur le web, le service worker range aussi chaque push dans IndexedDB (`dhb-notifs`, voir
// public/sw.js) : les notifications reçues app fermée sont fusionnées à l'ouverture de la page.
const NOTIFS_LEGACY_KEY = 'dhome_notifications';
const NOTIFS_OWNER_KEY = 'dhb-notif-owner';
const NOTIFS_MAX = 50;
// Deux entrées sans identifiant commun, même titre et même texte à moins de 5 min : une seule
const DUPLICATE_WINDOW = 5 * 60 * 1000;
export const NOTIFICATIONS_EVENT = 'dhb:notifications';

const notifsKey = (userId) => `${NOTIFS_LEGACY_KEY}:${userId}`;
const ownerOr = (userId) => (userId != null && userId !== '' ? String(userId) : readLocal(NOTIFS_OWNER_KEY));

function safeUrl(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').slice(0, 200);
  const body = String(raw.body || '').slice(0, 1000);
  if (!title && !body) return null;
  const time = Date.parse(raw.date);
  return {
    id: raw.id != null && raw.id !== '' ? String(raw.id) : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    body,
    url: safeUrl(raw.url),
    date: Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString(),
    read: !!raw.read,
  };
}

function isSameNotification(a, b) {
  if (a.id === b.id) return true;
  return a.title === b.title && a.body === b.body
    && Math.abs(Date.parse(a.date) - Date.parse(b.date)) < DUPLICATE_WINDOW;
}

// Notification Capacitor → entrée du centre (titre et texte parfois seulement dans `data` sur Android)
function nativeEntry(notification) {
  const n = notification || {};
  return {
    id: n.id ? `native-${n.id}` : null,
    title: n.title || n.data?.title,
    body: n.body || n.data?.body,
    url: n.data?.url,
  };
}

function parseList(value) {
  try {
    const list = JSON.parse(value || '[]');
    return Array.isArray(list) ? list.map(normalizeEntry).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Ajoute `extra` à `base` sans doublon, plus récentes d'abord, 50 au plus. */
function mergeNotifications(base, extra) {
  const out = [...base];
  for (const raw of extra) {
    const entry = normalizeEntry(raw);
    if (entry && !out.some(n => isSameNotification(n, entry))) out.push(entry);
  }
  return out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, NOTIFS_MAX);
}

/** Notifications du compte (le compte courant si `userId` est omis), plus récentes d'abord. */
export function readNotifications(userId) {
  const owner = ownerOr(userId);
  if (!owner) return [];
  return parseList(readLocal(notifsKey(owner)));
}

function storeNotifications(owner, list) {
  writeLocal(notifsKey(owner), JSON.stringify(list.slice(0, NOTIFS_MAX)));
  try { window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT)); } catch { /* hors navigateur */ }
}

/**
 * Compte connecté sur l'appareil (AuthContext : à l'ouverture de session, `null` à la
 * déconnexion). La première fois, l'ancienne liste commune est rattachée à ce compte puis effacée.
 */
// Dernier compte parti de l'appareil (déconnexion, session coupée par le serveur) : à l'arrivée
// d'un AUTRE compte, la file du service worker (pushs reçus app fermée, sans propriétaire) est
// vidée sans rien ranger, sinon le nouveau compte lisait les rendez-vous du précédent
const NOTIFS_LAST_OWNER_KEY = 'dhb-notif-last-owner';
// Purge en cours : syncServiceWorkerNotifications et getBadgeCount l'attendent avant de lire
let swQueuePurge = Promise.resolve();

export function setNotificationsOwner(userId) {
  if (userId == null || userId === '') {
    const leaving = readLocal(NOTIFS_OWNER_KEY);
    if (leaving) writeLocal(NOTIFS_LAST_OWNER_KEY, leaving);
    writeLocal(NOTIFS_OWNER_KEY, null);
    return;
  }
  const owner = String(userId);
  const previousOwner = readLocal(NOTIFS_OWNER_KEY);
  if (!previousOwner) {
    const last = readLocal(NOTIFS_LAST_OWNER_KEY);
    if (last && last !== owner && !isNative) {
      swQueuePurge = readServiceWorkerNotifications(true).then(() => undefined, () => undefined);
    }
  }
  writeLocal(NOTIFS_LAST_OWNER_KEY, null);
  writeLocal(NOTIFS_OWNER_KEY, owner);
  const legacy = readLocal(NOTIFS_LEGACY_KEY);
  if (legacy != null) {
    const old = parseList(legacy);
    if (old.length) storeNotifications(owner, mergeNotifications(readNotifications(owner), old));
    writeLocal(NOTIFS_LEGACY_KEY, null);
  }
}

/** Range une notification reçue. Sans compte connu (déconnecté), elle n'est pas gardée. */
export function addNotification(raw, userId) {
  const owner = ownerOr(userId);
  const entry = normalizeEntry({ ...raw, date: raw?.date || new Date().toISOString() });
  if (!owner || !entry) return;
  const list = readNotifications(owner);
  const existing = list.find(n => isSameNotification(n, entry));
  if (existing) {
    // Déjà reçue app ouverte puis touchée : elle passe en lue (et garde le lien s'il manquait)
    if ((entry.read && !existing.read) || (entry.url && !existing.url)) {
      storeNotifications(owner, list.map(n => (n === existing
        ? { ...n, read: n.read || entry.read, url: n.url || entry.url }
        : n)));
    }
    return;
  }
  storeNotifications(owner, mergeNotifications(list, [entry]));
}

export function getUnreadCount(userId) {
  return readNotifications(userId).filter(n => !n.read).length;
}

export function markAllNotificationsRead(userId) {
  const owner = ownerOr(userId);
  if (!owner) return;
  const list = readNotifications(owner);
  if (!list.some(n => !n.read)) return;
  storeNotifications(owner, list.map(n => ({ ...n, read: true })));
}

export function removeNotification(id, userId) {
  const owner = ownerOr(userId);
  if (!owner) return;
  storeNotifications(owner, readNotifications(owner).filter(n => n.id !== String(id)));
}

export function clearNotifications(userId) {
  const owner = ownerOr(userId);
  if (owner) storeNotifications(owner, []);
}

// IndexedDB partagée avec le service worker (même nom, même version, même magasin)
const NOTIF_DB = 'dhb-notifs';
const NOTIF_STORE = 'items';

function openNotifDb() {
  return new Promise((resolve) => {
    // Jamais bloquant : navigation privée, IndexedDB absente ou bloquée → rien
    const timer = setTimeout(() => resolve(null), 2000);
    const done = (db) => { clearTimeout(timer); resolve(db); };
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) { done(null); return; }
      const req = indexedDB.open(NOTIF_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(NOTIF_STORE)) {
          req.result.createObjectStore(NOTIF_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
}

// Lit (et vide si `consume`) les notifications rangées par le service worker
async function readServiceWorkerNotifications(consume) {
  const db = await openNotifDb();
  if (!db) return [];
  return new Promise((resolve) => {
    let items = [];
    const finish = (value) => { try { db.close(); } catch { /* déjà fermée */ } resolve(value); };
    try {
      const tx = db.transaction(NOTIF_STORE, consume ? 'readwrite' : 'readonly');
      const store = tx.objectStore(NOTIF_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        items = Array.isArray(req.result) ? req.result : [];
        if (consume) items.forEach(item => { if (item?.id != null) store.delete(item.id); });
      };
      tx.oncomplete = () => finish(items);
      tx.onerror = () => finish([]);
      tx.onabort = () => finish([]);
    } catch {
      finish([]);
    }
  });
}

/**
 * Web : rattache au compte les notifications rangées par le service worker (reçues app fermée).
 * Rien sur l'app native ni sans compte connu. Renvoie le nombre de notifications ajoutées.
 */
export async function syncServiceWorkerNotifications(userId) {
  const owner = ownerOr(userId);
  if (isNative || !owner) return 0;
  await swQueuePurge;
  const items = await readServiceWorkerNotifications(true);
  if (!items.length) return 0;
  const before = readNotifications(owner);
  const merged = mergeNotifications(before, items);
  storeNotifications(owner, merged);
  return Math.max(0, merged.length - before.length);
}

/**
 * Pastille de l'icône : non lues du compte + notifications du service worker pas encore
 * rattachées (sans les compter deux fois quand l'app ouverte les avait déjà rangées).
 */
export async function getBadgeCount(userId) {
  const local = readNotifications(userId);
  const unread = local.filter(n => !n.read).length;
  if (isNative || !ownerOr(userId)) return unread;
  await swQueuePurge;
  const pending = (await readServiceWorkerNotifications(false))
    .map(normalizeEntry)
    .filter(entry => entry && !local.some(n => isSameNotification(n, entry)));
  return unread + pending.length;
}
