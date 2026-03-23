// D'Home Barber - Service Worker for Push Notifications

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
        data: data.data || { url: '/' },
        vibrate: [200, 100, 200],
      }),
      // Set badge count on app icon
      navigator.setAppBadge ? navigator.setAppBadge(1) : Promise.resolve(),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    Promise.all([
      // Clear badge
      navigator.clearAppBadge ? navigator.clearAppBadge() : Promise.resolve(),
      // Focus or open window
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      }),
    ])
  );
});
