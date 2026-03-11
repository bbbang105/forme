'use client';

import { useEffect } from 'react';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

async function registerServiceWorker(attempt = 1): Promise<void> {
  try {
    await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * attempt;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      return registerServiceWorker(attempt + 1);
    }
    // All retries exhausted — log in development only
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SW] Registration failed after', MAX_RETRIES, 'attempts:', err);
    }
  }
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void registerServiceWorker();
    }
  }, []);

  return null;
}
