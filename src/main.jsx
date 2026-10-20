import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initCapacitor, isNative } from '@/lib/capacitor'
import { initNativePush, addNotification, getBadgeCount, syncServiceWorkerNotifications } from '@/lib/pushNotifications'
import { reloadOnceForStaleChunk } from '@/lib/chunkReload'
import { startMotionPermission } from '@/lib/motion'
import { initErrorReporting } from '@/lib/analytics'

// Erreurs et promesses non gérées : remontées dans Admin → Trafic (« Erreurs de l'app »), dès avant
// le premier affichage
initErrorReporting()

// Après un déploiement, un onglet resté ouvert demande d'anciens fichiers de page qui n'existent
// plus : Vite émet `vite:preloadError`, on recharge une fois pour prendre la nouvelle version
// (au lieu de « Une erreur est survenue »). Hors ligne ou déjà tenté : l'ErrorBoundary prend le relais
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForStaleChunk()) event.preventDefault();
});

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

// Gyroscope des cartes FUT : iOS oublie l'autorisation à chaque lancement. App iPhone : redemandée
// en silence au premier toucher ; Safari : fenêtre MotionPrompt la première fois, puis redemandée
// au premier toucher sur une carte ; ailleurs, actif d'emblée (voir lib/motion.js)
startMotionPermission();

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

    // Toucher une notification : navigation dans l'app, sans rechargement (une saisie en cours
    // n'est pas perdue), et rien du tout si l'adresse visée est déjà ouverte. Chemin, requête et
    // fragment comparés : /admin/agenda?date=… doit encore changer de jour. Même garde que
    // pushNotifications.js côté natif (« / » mais pas « // »)
    if (event.data?.type === 'NAVIGATE') {
      const url = event.data.url;
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
        const current = window.location.pathname + window.location.search + window.location.hash;
        if (url !== current) {
          window.history.pushState({}, '', url);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      } else if (typeof url === 'string' && url) {
        window.location.href = url; // URL absolue ou inattendue : comportement d'avant
      }
    }
  });

  // Set correct badge on app launch
  updateBadge();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
