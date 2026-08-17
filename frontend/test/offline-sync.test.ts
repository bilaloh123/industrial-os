import { enqueue, listOutbox, removeOutboxEntry } from '../lib/offline/db';
import { syncOutbox, registerAccessTokenGetter, retryEntry, discardEntry } from '../lib/offline/sync';

// jsdom's navigator.onLine is read-only by default — redefine it per test.
function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

async function clearOutbox() {
  const all = await listOutbox();
  await Promise.all(all.map((e) => removeOutboxEntry(e.id)));
}

describe('offline/sync — syncOutbox()', () => {
  beforeEach(async () => {
    await clearOutbox();
    setOnline(true);
    registerAccessTokenGetter(() => 'fake-token');
    (global as any).fetch = jest.fn();
  });

  it('does nothing when the device is offline (never attempts to reach an unreachable server)', async () => {
    setOnline(false);
    await enqueue({ method: 'POST', path: '/api/stock/movements', body: {}, description: 'حركة' });

    const result = await syncOutbox();
    expect(result).toEqual({ succeeded: 0, failed: 0 });
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('replays a queued mutation successfully and removes it from the outbox', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'mv_1' }) });
    const entry = await enqueue({
      method: 'POST', path: '/api/stock/movements',
      body: { productId: 'p1', quantity: 10 }, description: 'استلام شراء',
    });

    const result = await syncOutbox();
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    const remaining = await listOutbox();
    expect(remaining.some((e) => e.id === entry.id)).toBe(false);
  });

  it('marks a rejected mutation as "failed" with the server error — never silently drops it (no data loss)', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ message: 'الكمية المطلوبة تفوق المتوفر فهذا المستودع (2)' }),
    });
    const entry = await enqueue({
      method: 'POST', path: '/api/stock/movements',
      body: { productId: 'p1', quantity: -50 }, description: 'بيع',
    });

    const result = await syncOutbox();
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);

    const remaining = await listOutbox();
    const failedEntry = remaining.find((e) => e.id === entry.id);
    expect(failedEntry).toBeDefined(); // still present — not lost
    expect(failedEntry?.status).toBe('failed');
    expect(failedEntry?.error).toContain('تفوق المتوفر');
  });

  it('stops and keeps the entry pending if the connection drops again mid-sync (retried next time, not lost)', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const entry = await enqueue({ method: 'POST', path: '/api/stock/movements', body: {}, description: 'حركة' });

    const result = await syncOutbox();
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0); // not "failed" (a conflict) — just still pending, no data lost

    const remaining = await listOutbox();
    const stillThere = remaining.find((e) => e.id === entry.id);
    expect(stillThere?.status).toBe('pending');
  });

  it('replays multiple queued entries in FIFO order', async () => {
    const calledPaths: string[] = [];
    (global as any).fetch = jest.fn().mockImplementation(async (url: string) => {
      calledPaths.push(url);
      return { ok: true, json: async () => ({}) };
    });

    await enqueue({ method: 'POST', path: '/api/first', body: {}, description: 'أول' });
    await new Promise((r) => setTimeout(r, 2));
    await enqueue({ method: 'POST', path: '/api/second', body: {}, description: 'ثاني' });

    await syncOutbox();

    expect(calledPaths[0]).toContain('/api/first');
    expect(calledPaths[1]).toContain('/api/second');
  });

  it('does not re-attempt an entry already marked "failed" until the user explicitly retries', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'خطأ' }) });
    await enqueue({ method: 'POST', path: '/api/x', body: {}, description: 'عملية' });
    await syncOutbox(); // first attempt -> marked failed

    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const secondSync = await syncOutbox(); // should skip the already-failed entry
    expect(secondSync.succeeded).toBe(0);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
});

describe('offline/sync — retryEntry() / discardEntry()', () => {
  beforeEach(async () => {
    await clearOutbox();
    setOnline(true);
    registerAccessTokenGetter(() => 'fake-token');
  });

  it('retryEntry() resets a failed entry to pending and re-attempts sync', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'خطأ مؤقت' }) });
    const entry = await enqueue({ method: 'POST', path: '/api/retry-me', body: {}, description: 'عملية' });
    await syncOutbox();

    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await retryEntry(entry.id);

    const remaining = await listOutbox();
    expect(remaining.some((e) => e.id === entry.id)).toBe(false); // succeeded on retry -> removed
  });

  it('discardEntry() permanently removes an entry the user chose to abandon', async () => {
    const entry = await enqueue({ method: 'POST', path: '/api/discard-me', body: {}, description: 'عملية' });
    await discardEntry(entry.id);
    const remaining = await listOutbox();
    expect(remaining.some((e) => e.id === entry.id)).toBe(false);
  });
});
