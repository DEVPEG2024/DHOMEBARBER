import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initCapacitor, isNative } from '@/lib/capacitor'
import { initNativePush } from '@/lib/pushNotifications'

const NOTIF_KEY = 'dhome_notifications';

function getUnreadCount() {
  try {
    const notifs = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
    return notifs.filter(n => !n.read).length;
  } catch {
    return 0;
  }
}

function updateBadge() {
  const count = getUnreadCount();
  if (navigator.setAppBadge && count > 0) {
    navigator.setAppBadge(count);
  } else if (navigator.clearAppBadge) {
    navigator.clearAppBadge();
  }
}

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
      const { title, body } = event.data.notification;
      try {
        const notifs = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
        notifs.unshift({
          id: Date.now(),
          title,
          body,
          date: new Date().toISOString(),
          read: false,
        });
        localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs.slice(0, 50)));
      } catch {}
      // Update badge with new unread count
      updateBadge();
    }

    if (event.data?.type === 'GET_BADGE_COUNT') {
      // SW asked for the real count, send it back
      navigator.serviceWorker.controller?.postMessage({
        type: 'BADGE_COUNT',
        count: getUnreadCount(),
      });
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
