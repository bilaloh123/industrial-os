import { setCached, getCached, enqueue, listOutbox, updateOutboxEntry, removeOutboxEntry } from '../lib/offline/db';

describe('offline/db — cache (GET fallback)', () => {
  it('returns null for a key that was never cached', async () => {
    const result = await getCached('/api/never-cached');
    expect(result).toBeNull();
  });

  it('stores and retrieves a cached value with a timestamp', async () => {
    await setCached('/api/stock/summary', [{ internalRef: 'A', onHand: 10 }]);
    const result = await getCached<any[]>('/api/stock/summary');
    expect(result).not.toBeNull();
    expect(result!.value).toEqual([{ internalRef: 'A', onHand: 10 }]);
    expect(typeof result!.cachedAt).toBe('string');
  });

  it('overwrites a previous cache entry for the same key (last-known-good, not history)', async () => {
    await setCached('/api/products', [{ id: '1' }]);
    await setCached('/api/products', [{ id: '1' }, { id: '2' }]);
    const result = await getCached<any[]>('/api/products');
    expect(result!.value).toHaveLength(2);
  });

  it('keeps separate cache entries per key', async () => {
    await setCached('/api/a', 'value-a');
    await setCached('/api/b', 'value-b');
    expect((await getCached('/api/a'))!.value).toBe('value-a');
    expect((await getCached('/api/b'))!.value).toBe('value-b');
  });
});

describe('offline/db — outbox (queued mutations)', () => {
  beforeEach(async () => {
    const all = await listOutbox();
    await Promise.all(all.map((e) => removeOutboxEntry(e.id)));
  });

  it('starts empty', async () => {
    const list = await listOutbox();
    expect(list).toEqual([]);
  });

  it('enqueues an entry with a generated id and pending status', async () => {
    const entry = await enqueue({
      method: 'POST',
      path: '/api/stock/movements',
      body: { productId: 'p1', quantity: 5 },
      description: 'حركة مخزون تجريبية',
    });
    expect(entry.id).toBeTruthy();
    expect(entry.status).toBe('pending');

    const list = await listOutbox();
    expect(list.some((e) => e.id === entry.id)).toBe(true);
  });

  it('preserves insertion order (FIFO) — critical for replaying warehouse operations correctly', async () => {
    const first = await enqueue({ method: 'POST', path: '/api/a', body: {}, description: 'أول عملية' });
    await new Promise((r) => setTimeout(r, 2));
    const second = await enqueue({ method: 'POST', path: '/api/b', body: {}, description: 'ثاني عملية' });

    const list = await listOutbox();
    const ids = list.map((e) => e.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
  });

  it('updates an entry status (e.g. pending -> failed with an error message)', async () => {
    const entry = await enqueue({ method: 'PATCH', path: '/api/x', body: {}, description: 'تعديل' });
    await updateOutboxEntry(entry.id, { status: 'failed', error: 'الكمية غير متوفرة' });

    const list = await listOutbox();
    const updated = list.find((e) => e.id === entry.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toBe('الكمية غير متوفرة');
  });

  it('removes an entry once successfully synced (or discarded by the user)', async () => {
    const entry = await enqueue({ method: 'POST', path: '/api/y', body: {}, description: 'عملية' });
    await removeOutboxEntry(entry.id);
    const list = await listOutbox();
    expect(list.some((e) => e.id === entry.id)).toBe(false);
  });
});
