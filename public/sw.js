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
        icon: data.icon || '/icon.png',
        badge: data.badge || '/icon.png',
        data: { url: '/notifications', title: data.title, body: data.body },
        vibrate: [200, 100, 200],
      }),
      // Store notification + update badge
      storeAndBadge(data),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Tell the app to refresh badge
      for (const client of clientList) {
        client.postMessage({ type: 'REFRESH_BADGE' });
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: '/notifications' });
          return client.focus();
        }
      }
      return clients.openWindow('/notifications');
    })
  );
});

// Store notification and update badge count
async function storeAndBadge(data) {
  // Notify all open clients to store the notification
  const allClients = await clients.matchAll({ includeUncontrolled: true });
  for (const client of allClients) {
    client.postMessage({
      type: 'PUSH_RECEIVED',
      notification: { title: data.title, body: data.body },
    });
  }

  // Update badge with unread count
  // We can't access localStorage from SW, so we count via clients
  // Increment badge by 1 (clients will sync the real count)
  if (navigator.setAppBadge) {
    // Ask a client for the real unread count
    if (allClients.length > 0) {
      allClients[0].postMessage({ type: 'GET_BADGE_COUNT' });
    } else {
      // No client open, just set badge to 1
      navigator.setAppBadge(1);
    }
  }
}

// Listen for badge count responses from clients
self.addEventListener('message', (event) => {
  if (event.data?.type === 'BADGE_COUNT') {
    const count = event.data.count || 0;
    if (count > 0 && navigator.setAppBadge) {
      navigator.setAppBadge(count);
    } else if (navigator.clearAppBadge) {
      navigator.clearAppBadge();
    }
  }
});
