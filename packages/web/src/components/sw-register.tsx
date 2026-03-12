'use client';

import {useEffect} from 'react';
import {SW_MAX_REGISTRATION_RETRIES, SW_RETRY_BASE_DELAY_MS} from '@/lib/constants';

async function registerServiceWorker(attempt = 1): Promise<void> {
  try {
    await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
  } catch (err) {
    if (attempt < SW_MAX_REGISTRATION_RETRIES) {
      const delay = SW_RETRY_BASE_DELAY_MS * attempt;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      return registerServiceWorker(attempt + 1);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SW] Registration failed after', SW_MAX_REGISTRATION_RETRIES, 'attempts:', err);
    }
  }
}

/**
 * 앱 방문 시 브라우저 푸시 구독을 서버와 동기화.
 * 브라우저에 활성 구독이 있으면 서버에 upsert하여
 * 배포 후 endpoint 변경이나 DB 비활성화를 자동 복구한다.
 */
async function syncPushSubscription(): Promise<void> {
  try {
    if (!('PushManager' in window) || Notification.permission !== 'granted') return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) return;

    // 세션 내 중복 호출 방지
    const SYNC_KEY = 'push-sync-endpoint';
    if (sessionStorage.getItem(SYNC_KEY) === subJson.endpoint) return;

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
      }),
    });

    sessionStorage.setItem(SYNC_KEY, subJson.endpoint);
  } catch {
    // 동기화 실패는 무시 — 다음 방문 시 재시도
  }
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void registerServiceWorker().then(() => syncPushSubscription());
    }
  }, []);

  return null;
}
