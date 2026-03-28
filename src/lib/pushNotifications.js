import { apiRequest, apiUrl } from '@/api/apiClient';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const isNative = Capacitor.isNativePlatform();

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
  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions();
  }
  if (permStatus.receive !== 'granted') {
    throw new Error('Permission push refusée');
  }
  await PushNotifications.register();
  return true;
}

// Setup native push listeners (call once at app startup)
export function initNativePush() {
  if (!isNative) return;

  // Registration success - send token to backend
  PushNotifications.addListener('registration', async (token) => {
    try {
      await apiRequest('POST', apiUrl('/push/subscribe-native'), {
        token: token.value,
        platform: Capacitor.getPlatform(),
      });
    } catch {
      // Silent fail - will retry on next launch
    }
  });

  // Registration error
  PushNotifications.addListener('registrationError', (error) => {
    console.warn('Push registration failed:', error);
  });

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
  });

  // Notification tapped
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification.data;
    if (data?.url) {
      window.location.hash = data.url;
    }
  });
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

  await apiRequest('POST', apiUrl('/push/subscribe'), subscription.toJSON());
  return true;
}

// Unsubscribe from push
export async function unsubscribeFromPush() {
  if (isNative) {
    await PushNotifications.removeAllListeners();
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
