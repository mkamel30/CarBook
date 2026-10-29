import { describe, it, expect, vi } from 'vitest';
import { ensureSession, linkDeviceToAccount, type SessionStore, type StoredSession } from './session';

const DEVICE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

class MemoryStore implements SessionStore {
  private value: StoredSession | null = null;
  async load() { return this.value; }
  async save(s: StoredSession) { this.value = s; }
  async clear() { this.value = null; }
}

function issued(userId: string, guest: boolean, refreshToken: string) {
  return {
    accessToken: `at-${userId}`,
    refreshToken,
    sessionId: `s-${userId}`,
    user: { id: userId, email: `${userId}@x`, name: 'N', picture: null, ...(guest ? { guest: true } : {}) },
  };
}

const transport = (fetchImpl: any) => ({ baseUrl: 'https://example.test', fetchImpl });

describe('device session', () => {
  it('registers on first run and stores the session', async () => {
    const store = new MemoryStore();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, data: issued(DEVICE, true, 'rt-1') }),
    });

    const session = await ensureSession(store, DEVICE, transport(fetchImpl));

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/api/auth/device',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(session.guest).toBe(true);
    expect((await store.load())?.refreshToken).toBe('rt-1');
  });

  it('reuses a session that is not close to expiry without calling the network', async () => {
    const store = new MemoryStore();
    const fetchImpl = vi.fn();
    await ensureSession(store, DEVICE, transport(vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, data: issued(DEVICE, true, 'rt-1') }),
    })));

    const again = await ensureSession(store, DEVICE, transport(fetchImpl));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(again.accessToken).toBe(`at-${DEVICE}`);
  });

  it('refreshes with the stored token once the access token is nearly stale', async () => {
    const store = new MemoryStore();
    await store.save({
      accessToken: 'old', refreshToken: 'rt-1', userId: `guest:${DEVICE}`,
      guest: true, expiresAt: Date.now() + 1000,
    });

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, data: issued('real1', false, 'rt-2') }),
    });
    const session = await ensureSession(store, DEVICE, transport(fetchImpl));

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toEqual({ deviceId: DEVICE, refreshToken: 'rt-1' });
    expect(session.userId).toBe('real1');
    expect(session.guest).toBe(false);
  });

  it('falls back to registering when the stored token is no longer accepted', async () => {
    const store = new MemoryStore();
    await store.save({
      accessToken: 'old', refreshToken: 'burned', userId: `guest:${DEVICE}`,
      guest: true, expiresAt: Date.now() - 1,
    });

    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ success: false, error: 'reuse detected' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: issued(DEVICE, true, 'rt-new') }) });

    const session = await ensureSession(store, DEVICE, transport(fetchImpl));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ deviceId: DEVICE });
    expect(session.refreshToken).toBe('rt-new');
  });

  it('links using the account token, not the guest one', async () => {
    const store = new MemoryStore();
    await store.save({
      accessToken: 'guest-at', refreshToken: 'rt-1', userId: `guest:${DEVICE}`,
      guest: true, expiresAt: Date.now() + 60000,
    });

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, data: issued('real1', false, 'rt-2') }),
    });
    const session = await linkDeviceToAccount(store, DEVICE, 'account-at', transport(fetchImpl));

    const headers = fetchImpl.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer account-at');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ deviceId: DEVICE });
    expect(session.userId).toBe('real1');
    expect((await store.load())?.refreshToken).toBe('rt-2');
  });
});
