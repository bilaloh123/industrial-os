'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onSyncStateChange, syncOutbox, retryEntry, discardEntry } from './sync';
import type { OutboxEntry } from './db';

type NetworkStatusValue = {
  online: boolean;
  syncing: boolean;
  pending: OutboxEntry[];
  syncNow: () => void;
  retry: (id: string) => void;
  discard: (id: string) => void;
};

const NetworkStatusContext = createContext<NetworkStatusValue | null>(null);

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState<OutboxEntry[]>([]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    const unsubscribe = onSyncStateChange(({ syncing, pending }) => {
      setSyncing(syncing);
      setPending(pending);
    });

    // populate pending list on first mount + attempt an initial sync
    syncOutbox();

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      unsubscribe();
    };
  }, []);

  const syncNow = useCallback(() => { syncOutbox(); }, []);
  const retry = useCallback((id: string) => { retryEntry(id); }, []);
  const discard = useCallback((id: string) => { discardEntry(id); }, []);

  return (
    <NetworkStatusContext.Provider value={{ online, syncing, pending, syncNow, retry, discard }}>
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus() {
  const ctx = useContext(NetworkStatusContext);
  if (!ctx) throw new Error('useNetworkStatus must be used inside <NetworkStatusProvider>');
  return ctx;
}
