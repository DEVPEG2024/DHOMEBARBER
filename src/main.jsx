import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initCapacitor, isNative } from '@/lib/capacitor'
import { initNativePush, addNotification, getBadgeCount, syncServiceWorkerNotifications } from '@/lib/pushNotifications'

// Pastille de l'icône (web installé) : non lues du compte connecté sur l'appareil, plus les
// notifications reçues app fermée que le service worker garde en attente
function updateBadge() {
  getBadgeCount().then((count) => {
    if (navigator.setAppBadge && count > 0) {
      return navigator.setAppBadge(count);
    } else if (navigator.clearAppBadge) {
      return navigator.clearAppBadge();
    }
    return null;
  }).catch(() => {});
}

// Gyroscope des cartes FUT : sur iOS l'autorisation est demandée par la fenêtre
// MotionPrompt (profil d'un barber), plus au premier geste n'importe où ; ailleurs, actif d'emblée

// Initialize Capacitor on native platforms
if (isNative) {
  initCapacitor();
  initNativePush();
}

// Register service worker for push notifications (web only)
if (!isNative && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_RECEIVED') {
      // Même identifiant que la copie gardée par le service worker : pas de doublon à la fusion
      addNotification(event.data.notification || {});
      // Puis on vide la copie du service worker dans la liste du compte : sinon une
      // notification effacée de la page Notifications y revenait à l'ouverture suivante
      syncServiceWorkerNotifications().catch(() => 0).then(updateBadge);
    }

    if (event.data?.type === 'GET_BADGE_COUNT') {
      // SW asked for the real count, send it back
      getBadgeCount().then((count) => {
        navigator.serviceWorker.controller?.postMessage({ type: 'BADGE_COUNT', count });
      }).catch(() => {});
    }

    if (event.data?.type === 'REFRESH_BADGE') {
      updateBadge();
    }

    if (event.data?.type === 'NAVIGATE') {
      window.location.href = event.data.url;
    }
  });

  // Set correct badge on app launch
  updateBadge();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
