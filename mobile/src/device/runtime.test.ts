import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createRuntime,
  ensureDeviceId,
  newDeviceId,
  SyncFailedError,
  MAX_SYNC_ATTEMPTS,
  type DeviceIdStore,
} from './runtime';
import type { LocalStore } from '../../../src/sync/client';
import type { SessionStore, StoredSession } from './session';
import { makeFileDeviceIdStore, makeFileSessionStore } from './fileStores';

const DEVICE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

class MemoryDeviceIdStore implements DeviceIdStore {
  private value: string | null = null;
  async load() { return this.value; }
  async save(id: string) { this.value = id; }
}

class MemorySessionStore implements SessionStore {
  private value: StoredSession | null = null;
  async load() { return this.value; }
  async save(s: StoredSession) { this.value = s; }
  async clear() { this.value = null; }
}

/** Transport double: routes the two endpoints the runtime actually calls. */
let syncCalls = 0;
let authCalls = 0;
let lastSyncInit: any;
let failSyncTimes = 0;

function makeFetchImpl() {
  return (async (url: any, init: any) => {
    if (String(url).includes('/api/auth/device')) {
      authCalls++;
      const body = JSON.parse(init.body);
      const userId = `guest-${body.deviceId}`;
      return { ok: true, status: 200, json: async () => ({
        success: true,
        data: {
          accessToken: `at-${userId}`, refreshToken: 'rt-1', sessionId: 's-1',
          user: { id: userId, email: 'g', name: 'G', picture: null, guest: true },
        },
      }) };
    }
    if (String(url).includes('/api/sync')) {
      syncCalls++;
      lastSyncInit = init;
      if (failSyncTimes > 0) {
        failSyncTimes--;
        return { ok: false, status: 500, json: async () => ({ success: false, error: 'boom' }) };
      }
      return { ok: true, status: 200, json: async () => ({
        success: true,
        data: { serverSeq: 5, pulled: {}, rejected: [], applied: [] },
      }) };
    }
    throw new Error(`unexpected url ${url}`);
  }) as unknown as typeof fetch;
}

class FakeStore implements LocalStore {
  since = 0;
  marked: number[] = [];
  getSince() { return this.since; }
  collectDirty() { return {}; }
  applyPulled() {}
  markSynced(serverSeq: number) { this.since = serverSeq; this.marked.push(serverSeq); }
}

describe('device sync runtime', () => {
  let deviceIdStore: MemoryDeviceIdStore;
  let sessionStore: MemorySessionStore;
  let store: FakeStore;
  let fetchImpl: ReturnType<typeof makeFetchImpl>;

  beforeEach(() => {
    vi.useFakeTimers();
    syncCalls = 0; authCalls = 0; lastSyncInit = undefined; failSyncTimes = 0;
    deviceIdStore = new MemoryDeviceIdStore();
    sessionStore = new MemorySessionStore();
    store = new FakeStore();
    fetchImpl = makeFetchImpl();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeRuntime(extra: Partial<Parameters<typeof createRuntime>[0]> = {}) {
    return createRuntime({
      baseUrl: 'https://srv.test',
      sessionStore, deviceIdStore,
      makeLocalStore: () => store,
      fetchImpl,
      addOnlineListener: () => () => {},
      now: () => 12345,
      ...extra,
    });
  }

  it('mints a stable device id on first use and reuses it afterwards', async () => {
    const id1 = await ensureDeviceId(deviceIdStore);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await ensureDeviceId(deviceIdStore)).toBe(id1);
    expect(newDeviceId()).not.toBe(id1);
  });

  it('manual/boot trigger: registers the session, then syncs with the bearer token and advances the store', async () => {
    const rt = makeRuntime();
    const outcome = await rt.syncNow();

    expect(outcome.serverSeq).toBe(5);
    expect(store.marked).toEqual([5]);
    expect(authCalls).toBe(1);
    expect(syncCalls).toBe(1);
    expect(lastSyncInit.headers.Authorization).toBe(`Bearer at-guest-${idOf(deviceIdStore)}`);
    expect(JSON.parse(lastSyncInit.body).deviceId).not.toHaveLength(0);

    const status = rt.getStatus();
    expect(status.phase).toBe('idle');
    expect(status.lastSyncedAt).toBe(12345);
    expect(status.lastError).toBeNull();
  });

  it('network reconnect (online event) triggers exactly one sync — coalesced while in flight', async () => {
    let onlineCb: (() => void) | null = null;
    const rt = makeRuntime({
      addOnlineListener: (cb) => { onlineCb = cb; return () => {}; },
    });
    rt.start();
    await vi.advanceTimersByTimeAsync(0); // let the boot sync settle
    expect(syncCalls).toBe(1);

    onlineCb!();
    onlineCb!(); // double bounce must NOT double-sync
    await vi.advanceTimersByTimeAsync(0);
    expect(syncCalls).toBe(2);
  });

  it('backoff gives up after exactly MAX attempts with an explicit failure state', async () => {
    failSyncTimes = 99;
    const sleeps: number[] = [];
    const rt = makeRuntime({
      sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
      random: () => 1, // deterministic: ceiling of the jitter window each time
      baseDelayMs: 500,
    });

    const err: SyncFailedError = await rt.syncNow().catch((e) => e);
    expect(err).toBeInstanceOf(SyncFailedError);
    expect(err.attempts).toBe(MAX_SYNC_ATTEMPTS);
    expect(err.message).toContain(`after ${MAX_SYNC_ATTEMPTS} attempts`);
    expect(syncCalls).toBe(MAX_SYNC_ATTEMPTS);
    // Bounded, exponential jittered waits: only 4 sleeps (none after the last attempt).
    expect(sleeps).toEqual([500, 1000, 2000, 4000]);

    const status = rt.getStatus();
    expect(status.phase).toBe('error');
    expect(status.lastError).toContain(`after ${MAX_SYNC_ATTEMPTS} attempts`);
    expect(status.lastErrorAt).toBe(12345);
  });

  it('default backoff really waits on timers and then settles (no orphan timers)', async () => {
    failSyncTimes = 99;
    const rt = makeRuntime({ random: () => 1, baseDelayMs: 500 });
    const p = rt.syncNow();
    const swallowed = p.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await swallowed;
    expect(err).toBeInstanceOf(SyncFailedError);
    expect(syncCalls).toBe(MAX_SYNC_ATTEMPTS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers on a retry instead of giving up early: transient failure then success', async () => {
    failSyncTimes = 1; // first sync 500s, second lands
    const rt = makeRuntime({ sleep: () => Promise.resolve() });
    const outcome = await rt.syncNow();
    expect(outcome.serverSeq).toBe(5);
    expect(syncCalls).toBe(2);
    expect(rt.getStatus().phase).toBe('idle');
  });

  it('file-backed SessionStore/DeviceIdStore persist across instances on disk', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'carbook_runtime_'));
    try {
      const idFile = path.join(dir, 'device.json');
      const sessionFile = path.join(dir, 'session.json');
      const id1 = await ensureDeviceId(makeFileDeviceIdStore(idFile));
      expect(await ensureDeviceId(makeFileDeviceIdStore(idFile))).toBe(id1);

      await makeRuntime({
        deviceIdStore: makeFileDeviceIdStore(idFile),
        sessionStore: makeFileSessionStore(sessionFile),
      }).syncNow();

      const persisted = await makeFileSessionStore(sessionFile).load();
      expect(persisted?.refreshToken).toBe('rt-1'); // written by the runtime above
      expect(persisted?.accessToken).toBe(`at-guest-${id1}`);
      const rtStore = makeFileSessionStore(sessionFile);
      await rtStore.clear();
      expect(await rtStore.load()).toBeNull();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

// helper: extract the minted device id from the in-memory store for header asserts
function idOf(store: MemoryDeviceIdStore): string {
  return (store as any).value ?? '';
}
