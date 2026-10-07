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

    // Notification received while app is in foreground
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const NOTIF_KEY = 'dhome_notifications';
      try {
        const notifs = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
        notifs.unshift({
          id: Date.now(),
          title: notification.title || '',
          body: notification.body || '',
          date: new Date().toISOString(),
          read: false,
        });
        localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs.slice(0, 50)));
      } catch {}
    }),

    // Notification touchée : ouvre la page visée. L'app utilise des URL classiques
    // (BrowserRouter) : changer le « hash » ne faisait rien. pushState + popstate
    // fait suivre le routeur sans recharger l'app.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
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
