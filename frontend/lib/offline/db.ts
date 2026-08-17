'use client';

/**
 * Minimal IndexedDB wrapper for offline support (PHASE 53).
 * Two object stores:
 *  - "cache": last-known-good GET responses, keyed by endpoint path.
 *    Lets the UI render real (if slightly stale) data when there's no
 *    network, instead of a blank screen.
 *  - "outbox": mutations (POST/PATCH) the user made while offline,
 *    queued in order and replayed once connectivity returns.
 */

const DB_NAME = 'industrial-os-offline';
const DB_VERSION = 1;
const CACHE_STORE = 'cache';
const OUTBOX_STORE = 'outbox';

export type OutboxEntry = {
  id: string; // client-generated, used to correlate optimistic UI state
  createdAt: string;
  method: 'POST' | 'PATCH';
  path: string;
  body: unknown;
  description: string; // human-readable summary shown in the sync UI
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB غير متوفر فهاد المتصفح'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    tx.oncomplete = () => resolve((req as IDBRequest<T>)?.result as T);
    tx.onerror = () => reject(tx.error);
  });
}

// ---- cache (GET fallback) ----
export async function setCached(key: string, value: unknown) {
  try {
    await withStore(CACHE_STORE, 'readwrite', (store) =>
      store.put({ key, value, cachedAt: new Date().toISOString() }),
    );
  } catch {
    // best-effort — a caching failure should never break the online path
  }
}

export async function getCached<T>(key: string): Promise<{ value: T; cachedAt: string } | null> {
  try {
    const result = await withStore<any>(CACHE_STORE, 'readonly', (store) => store.get(key));
    return result ? { value: result.value, cachedAt: result.cachedAt } : null;
  } catch {
    return null;
  }
}

// ---- outbox (queued mutations) ----
export async function enqueue(entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'status'>): Promise<OutboxEntry> {
  const full: OutboxEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  await withStore(OUTBOX_STORE, 'readwrite', (store) => store.put(full));
  return full;
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  try {
    const all = await withStore<OutboxEntry[]>(OUTBOX_STORE, 'readonly', (store) => store.getAll() as any);
    return (all ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function updateOutboxEntry(id: string, patch: Partial<OutboxEntry>) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    const store = tx.objectStore(OUTBOX_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (existing) store.put({ ...existing, ...patch });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeOutboxEntry(id: string) {
  await withStore(OUTBOX_STORE, 'readwrite', (store) => store.delete(id));
}
