// D'Home Barber - Service Worker for Push Notifications

const STORAGE_KEY = 'dhome_notifications';

self.addEventListener('push', (event) => {
  let data = { title: "D'Home Barber", body: 'Nouvelle notification' };

  try {
    data = event.data.json();
  } catch {
    data.body = event.data?.text() || data.body;
  }

  event.waitUntil(
    Promise.all([
      // Show notification
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || '/logo.png',
        badge: data.badge || '/logo.png',
        data: { url: '/notifications', title: data.title, body: data.body },
        vibrate: [200, 100, 200],
      }),
      // Set badge count on app icon
      navigator.setAppBadge ? navigator.setAppBadge(1) : Promise.resolve(),
      // Store notification for in-app display
      storeNotification(data),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    Promise.all([
      navigator.clearAppBadge ? navigator.clearAppBadge() : Promise.resolve(),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Try to focus existing window and navigate
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'NAVIGATE', url: '/notifications' });
            return client.focus();
          }
        }
        return clients.openWindow('/notifications');
      }),
    ])
  );
});

// Store notification in a way accessible to the main app
async function storeNotification(data) {
  // Use clients to post message to the app
  const allClients = await clients.matchAll({ includeUncontrolled: true });
  for (const client of allClients) {
    client.postMessage({
      type: 'PUSH_RECEIVED',
      notification: { title: data.title, body: data.body },
    });
  }
}
