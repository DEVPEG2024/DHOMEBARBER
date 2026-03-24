import { apiRequest, apiUrl } from '@/api/apiClient';

// Get VAPID public key from backend
export async function getVapidPublicKey() {
  const data = await apiRequest('GET', apiUrl('/push/vapid-key'));
  return data.publicKey;
}

// Check if push is supported
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Check if already subscribed
export async function isSubscribed() {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

// Subscribe to push notifications
export async function subscribeToPush() {
  if (!isPushSupported()) throw new Error('Push non supporté sur ce navigateur');

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permission refusée');

  // Register service worker
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // Get VAPID key
  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) throw new Error('Clé VAPID non configurée');

  // Subscribe
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  // Send subscription to backend
  await apiRequest('POST', apiUrl('/push/subscribe'), subscription.toJSON());
  return true;
}

// Unsubscribe from push
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();

  if (subscription) {
    // Notify backend
    try {
      await apiRequest('POST', apiUrl('/push/unsubscribe'), { endpoint: subscription.endpoint });
    } catch {
      // Ignore unsubscribe errors
    }
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
