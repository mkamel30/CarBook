import { describe, it, expect } from 'vitest';
import { syncOnce, type LocalStore, type PushPayload, type PulledTable } from './client';

class MemoryStore implements LocalStore {
  since = 0;
  dirty: PushPayload = {};
  pulledLog: Record<string, PulledTable>[] = [];
  appliedThrows = false;

  getSince() { return this.since; }
  collectDirty() { return this.dirty; }
  applyPulled(p: Record<string, PulledTable>) {
    if (this.appliedThrows) throw new Error('apply crashed');
    this.pulledLog.push(p);
  }
  markSynced(seq: number) { this.since = seq; }
}

function jsonResponse(body: unknown, ok = true, status = 200): any {
  return { ok, status, json: async () => body };
}

describe('sync client', () => {
  it('sends deviceId, since and dirty rows, then advances the cursor', async () => {
    let captured: any;
    const fetchImpl = (async (_url: any, init: any) => {
      captured = { url: _url, init };
      return jsonResponse({ success: true, data: { serverSeq: 42, pulled: {}, rejected: [] } });
    }) as any;

    const store = new MemoryStore();
    store.since = 7;
    store.dirty = { vehicles: { upsert: [{ id: 'v1', updatedAt: 1000 }] } };

    const out = await syncOnce(store, { baseUrl: 'https://vps/', deviceId: 'd1', fetchImpl });

    const body = JSON.parse(captured.init.body);
    expect(captured.url).toBe('https://vps/api/sync');
    expect(body).toEqual({ deviceId: 'd1', since: 7, pushed: { vehicles: { upsert: [{ id: 'v1', updatedAt: 1000 }] } } });
    expect(store.since).toBe(42);
    expect(out.serverSeq).toBe(42);
    expect(out.pushedCount).toBe(1);
  });

  it('applies pulled rows (including tombstones) before advancing', async () => {
    const fetchImpl = (async () => jsonResponse({
      success: true,
      data: {
        serverSeq: 10,
        pulled: { vehicles: { upsert: [{ id: 'v9', name: 'Remote' }], deleted: ['v3'] } },
      },
    })) as any;

    const store = new MemoryStore();
    const out = await syncOnce(store, { baseUrl: 'https://vps', deviceId: 'd1', fetchImpl });

    expect(store.pulledLog[0].vehicles.upsert[0].name).toBe('Remote');
    expect(store.pulledLog[0].vehicles.deleted).toContain('v3');
    expect(store.since).toBe(10);
    expect(out.pulledCount).toBe(2);
  });

  it('does not advance the cursor if applying pulled changes throws', async () => {
    const fetchImpl = (async () => jsonResponse({
      success: true,
      data: { serverSeq: 10, pulled: { vehicles: { upsert: [{ id: 'v1' }], deleted: [] } } },
    })) as any;

    const store = new MemoryStore();
    store.since = 5;
    store.appliedThrows = true;

    await expect(syncOnce(store, { baseUrl: 'https://vps', deviceId: 'd1', fetchImpl })).rejects.toThrow('apply crashed');
    expect(store.since).toBe(5);
  });

  it('throws on a non-OK HTTP response', async () => {
    const fetchImpl = (async () => jsonResponse({}, false, 500)) as any;
    await expect(syncOnce(new MemoryStore(), { baseUrl: 'https://vps', deviceId: 'd1', fetchImpl })).rejects.toThrow('sync failed: 500');
  });

  it('throws when the server reports success:false', async () => {
    const fetchImpl = (async () => jsonResponse({ success: false, error: 'Authentication required' })) as any;
    await expect(syncOnce(new MemoryStore(), { baseUrl: 'https://vps', deviceId: 'd1', fetchImpl })).rejects.toThrow('Authentication required');
  });

  it('sends a bearer token when provided', async () => {
    let headers: any;
    const fetchImpl = (async (_u: any, init: any) => { headers = init.headers; return jsonResponse({ success: true, data: { serverSeq: 1, pulled: {} } }); }) as any;
    await syncOnce(new MemoryStore(), { baseUrl: 'https://vps', deviceId: 'd1', authToken: 'tok', fetchImpl });
    expect(headers.Authorization).toBe('Bearer tok');
  });
});
