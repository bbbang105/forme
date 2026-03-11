'use client';

import { useEffect } from 'react';
import { SW_MAX_REGISTRATION_RETRIES, SW_RETRY_BASE_DELAY_MS } from '@/lib/constants';

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
    // All retries exhausted — log in development only
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SW] Registration failed after', SW_MAX_REGISTRATION_RETRIES, 'attempts:', err);
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
