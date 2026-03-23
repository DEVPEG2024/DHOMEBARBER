import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Register service worker for push notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });

  // Listen for push messages from service worker
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_RECEIVED') {
      const { title, body } = event.data.notification;
      // Store in localStorage for the notifications page
      try {
        const key = 'dhome_notifications';
        const notifs = JSON.parse(localStorage.getItem(key) || '[]');
        notifs.unshift({
          id: Date.now(),
          title,
          body,
          date: new Date().toISOString(),
          read: false,
        });
        localStorage.setItem(key, JSON.stringify(notifs.slice(0, 50)));
      } catch {}
    }

    if (event.data?.type === 'NAVIGATE') {
      window.location.href = event.data.url;
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
