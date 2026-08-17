'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // offline shell caching is a progressive enhancement — a failed
      // registration should never break the app itself
    });
  }, []);

  return null;
}
