/// <reference lib="webworker" />

// forme - Service Worker (Offline Cache + Push Notifications)

const CACHE_NAME = 'forme-v3';
const AUDIO_CACHE_NAME = 'forme-audio-v1';
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

// Activate: 이전 캐시 정리 (오디오 캐시는 보존)
self.addEventListener('activate', (event) => {
  const keepCaches = [CACHE_NAME, AUDIO_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => !keepCaches.includes(key)).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: 전략별 캐싱
// - 오디오(R2): cache-first (팟캐스트 오프라인 재생)
// - /_next/static/: cache-first (콘텐츠 해시 파일)
// - 폰트 파일: cache-first
// - /icons/: cache-first
// - /api/curation, /api/push: network-first
// - /api/* (기타): network-only
// - HTML 페이지: stale-while-revalidate
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // ── 0. Cache-first: 오디오 파일 (R2 외부 도메인, 팟캐스트 오프라인 재생)
  if (request.destination === 'audio' || /\.(mp3|m4a|wav|ogg|webm|aac|mp4)(\?.*)?$/i.test(request.url)) {
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // same-origin만 이후 전략 적용
  if (!request.url.startsWith(self.location.origin)) return;

  const url = new URL(request.url);

  // ── 1. Cache-first: Next.js 해시 정적 번들 (JS/CSS)
  if (url.pathname.startsWith('/_next/static/')) {
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

  // ── 2. Cache-first: 폰트 파일
  if (/\.(woff2?|ttf|otf)(\?.*)?$/.test(url.pathname)) {
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

  // ── 3. Cache-first: 아이콘 / 정적 이미지
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

  // ── 4. Network-first: 최신 데이터가 필수인 API
  if (
    url.pathname.startsWith('/api/curation') ||
    url.pathname.startsWith('/api/push')
  ) {
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
            cached ||
            new Response(
              JSON.stringify({ error: 'Offline' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            )
          )
        )
    );
    return;
  }

  // ── 5. Network-only: 나머지 API (mutation 관련)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'Offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // ── 6. Stale-while-revalidate: HTML 페이지
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      // 캐시가 있으면 즉시 반환하고 백그라운드에서 갱신
      return cached || networkFetch.catch(() =>
        new Response('Offline', { status: 503 })
      );
    })
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
