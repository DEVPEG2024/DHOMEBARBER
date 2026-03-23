const API_BASE = import.meta.env.PROD
  ? 'https://dhomebarber-api-3aabb8313cb6.herokuapp.com'
  : '';

function getAppId() {
  return localStorage.getItem('base44_app_id') || import.meta.env.VITE_BASE44_APP_ID || 'dhomebarber';
}

function getAuthHeaders() {
  const token = localStorage.getItem('base44_access_token') || localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// Get VAPID public key from backend
export async function getVapidPublicKey() {
  const res = await fetch(`${API_BASE}/api/apps/${getAppId()}/push/vapid-key`);
  const data = await res.json();
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
  const res = await fetch(`${API_BASE}/api/apps/${getAppId()}/push/subscribe`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!res.ok) throw new Error('Erreur lors de l\'enregistrement');
  return true;
}

// Unsubscribe from push
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();

  if (subscription) {
    // Notify backend
    await fetch(`${API_BASE}/api/apps/${getAppId()}/push/unsubscribe`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {});

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
