/// <reference lib="webworker" />

// forme - Service Worker (Offline Cache + Push Notifications)

const CACHE_NAME = 'forme-v2';
const STATIC_ASSETS = [
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install: 정적 에셋 프리캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: 이전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: 전략별 캐싱
// - 아이콘: cache-first (변경 드묾)
// - JS/CSS 번들, 페이지: network-first (항상 최신 우선)
// - API: network-only
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request.url.startsWith(self.location.origin)) return;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 아이콘만 cache-first (거의 안 바뀜)
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // API 요청: network-only (캐시 안 함)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ error: 'Offline' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // JS/CSS 번들 + 페이지: network-first, 오프라인 시 캐시
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) =>
          cached || new Response('Offline', { status: 503 })
        )
      )
  );
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

// 알림 클릭 — same-origin URL만 허용
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url || '/';
  const fullUrl = new URL(rawUrl, self.location.origin);
  if (fullUrl.origin !== self.location.origin) return;
  const urlToOpen = fullUrl.href;

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
