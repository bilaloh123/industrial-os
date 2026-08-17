'use client';

import { listOutbox, updateOutboxEntry, removeOutboxEntry, type OutboxEntry } from './db';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let accessTokenGetter: () => string | null = () => null;
export function registerAccessTokenGetter(fn: () => string | null) {
  accessTokenGetter = fn;
}

type SyncListener = (state: { syncing: boolean; pending: OutboxEntry[] }) => void;
const listeners = new Set<SyncListener>();
export function onSyncStateChange(fn: SyncListener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
async function notify(syncing: boolean) {
  const pending = await listOutbox();
  listeners.forEach((fn) => fn({ syncing, pending }));
}

let syncing = false;

/**
 * Replays every queued mutation against the real API, in the order it was
 * recorded. Stops surfacing an entry as "failed" (never silently drops it)
 * if the server rejects it — e.g. stock that was available when the user
 * was offline is gone by the time connectivity returns (PHASE 53: "يجب
 * كشف: Conflicts, Failed operations. ولا يجب فقدان البيانات.").
 */
export async function syncOutbox(): Promise<{ succeeded: number; failed: number }> {
  if (syncing) return { succeeded: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { succeeded: 0, failed: 0 };

  syncing = true;
  await notify(true);

  let succeeded = 0;
  let failed = 0;

  try {
    const entries = await listOutbox();
    for (const entry of entries) {
      if (entry.status === 'failed') continue; // needs explicit user retry, see retryEntry()
      await updateOutboxEntry(entry.id, { status: 'syncing' });
      try {
        const token = accessTokenGetter();
        const res = await fetch(`${API_URL}${entry.path}`, {
          method: entry.method,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(entry.body),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const message = typeof body.message === 'string' ? body.message : `فشل التزامن (${res.status})`;
          await updateOutboxEntry(entry.id, { status: 'failed', error: message });
          failed++;
        } else {
          await removeOutboxEntry(entry.id);
          succeeded++;
        }
      } catch {
        // network dropped again mid-sync — leave as pending, try again next time
        await updateOutboxEntry(entry.id, { status: 'pending' });
        break;
      }
    }
  } finally {
    syncing = false;
    await notify(false);
  }

  return { succeeded, failed };
}

export async function retryEntry(id: string) {
  await updateOutboxEntry(id, { status: 'pending', error: undefined });
  await syncOutbox();
}

export async function discardEntry(id: string) {
  await removeOutboxEntry(id);
  await notify(false);
}

// Auto-sync whenever the browser regains connectivity.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncOutbox();
  });
}
