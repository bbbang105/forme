/// <reference lib="webworker" />

// forme - Service Worker (Push Notifications)

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// fetch 핸들러 (Chrome PWA installability 필수 조건)
// 네트워크 우선 — 동적 앱이므로 캐싱 없이 패스스루
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// 푸시 수신
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'forme', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: data.tag || 'forme-notification',
    renotify: !!data.tag,
    requireInteraction: data.requireInteraction || false,
    data: {
      url: data.url || '/',
      timestamp: Date.now(),
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'forme', options)
  );
});

// 알림 클릭
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
