// Offline sync boot — mounts the WP2 sync runtime loop into the app shell.
//
// Composes the exact pieces device/runtime.ts orchestrates — ensureSession(guest
// device) -> syncOnce -> an `online` listener — but imports ONLY the stable
// primitives (device/session.ts, @device/localStore, @sync/client). At the time
// of writing device/runtime.ts is owned by WP2 and still being edited (its
// relative sync-client import is mid-fix), so the shell depends on this thin,
// build-safe wrapper instead; WP3 should switch the shell onto device/runtime.ts
// once it lands. All side effects (fetch, timers, network events) are injectable
// so the whole flow runs under Node/vitest.

import type { Database } from '@nozbe/watermelondb';
import { WMDBLocalStore } from '@device/localStore';
import { ensureSession, type SessionStore, type StoredSession } from '@device/session';
import { syncOnce, type SyncOutcome } from '@sync/client';

export interface DeviceIdStore {
  load(): Promise<string | null>;
  save(id: string): Promise<void>;
}

export type SyncPhase = 'idle' | 'offline' | 'syncing' | 'synced' | 'error';

export interface SyncState {
  phase: SyncPhase;
  message: string;
  lastSyncedAt: number | null;
  lastOutcome: SyncOutcome | null;
  guest: boolean;
}

export interface SyncBootDeps {
  db: Database;
  sessionStore: SessionStore;
  deviceIdStore: DeviceIdStore;
  baseUrl: string;
  /** Since-cursor persistence so restarts resume instead of re-pulling everything. */
  sinceStore?: { load(): number; save(seq: number): void };
  fetchImpl?: typeof fetch;
  /** Injectable connectivity for tests; defaults to navigator.onLine. */
  isOnline?: () => boolean;
  /** Registers an `online` listener; returns teardown. Defaults to window events. */
  addOnlineListener?: (cb: () => void) => () => void;
}

export interface SyncBoot {
  start(): () => void;
  syncNow(): Promise<SyncOutcome | null>;
  getStatus(): SyncState;
  subscribe(cb: (state: SyncState) => void): () => void;
}

function newDeviceId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function ensureDeviceId(store: DeviceIdStore): Promise<string> {
  const existing = await store.load();
  if (existing) return existing;
  const id = newDeviceId();
  await store.save(id);
  return id;
}

function defaultOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') return navigator.onLine;
  return true;
}

function defaultAddOnlineListener(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
  const handler = () => cb();
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}

export function createSyncBoot(deps: SyncBootDeps): SyncBoot {
  const isOnline = deps.isOnline ?? defaultOnline;
  const addOnlineListener = deps.addOnlineListener ?? defaultAddOnlineListener;

  let state: SyncState = {
    phase: 'idle', message: '准备就绪 / Ready', lastSyncedAt: null, lastOutcome: null, guest: false,
  };
  const listeners = new Set<(s: SyncState) => void>();
  let inFlight: Promise<SyncOutcome | null> | null = null;

  function set(next: Partial<SyncState>): void {
    state = { ...state, ...next };
    for (const cb of listeners) cb(state);
  }

  async function run(): Promise<SyncOutcome | null> {
    if (!deps.baseUrl) {
      set({ phase: 'offline', message: '本地模式 · Local only (no server)' });
      return null;
    }
    if (!isOnline()) {
      set({ phase: 'offline', message: '离线 · Offline' });
      return null;
    }
    set({ phase: 'syncing', message: '同步中… · Syncing…' });
    try {
      const deviceId = await ensureDeviceId(deps.deviceIdStore);
      const session: StoredSession = await ensureSession(deps.sessionStore, deviceId, {
        baseUrl: deps.baseUrl,
        fetchImpl: deps.fetchImpl,
      });
      const store = new WMDBLocalStore(deps.db, {
        loadSince: () => deps.sinceStore?.load() ?? 0,
        saveSince: (seq) => deps.sinceStore?.save(seq),
      });
      const outcome = await syncOnce(store, {
        baseUrl: deps.baseUrl,
        deviceId,
        authToken: session.accessToken,
        fetchImpl: deps.fetchImpl,
      });
      set({
        phase: 'synced',
        message: `已同步 · Synced (+${outcome.pushedCount}/↓${outcome.pulledCount})`,
        lastSyncedAt: Date.now(),
        lastOutcome: outcome,
        guest: session.guest,
      });
      return outcome;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ phase: 'error', message: `同步失败 · Retry pending: ${message}` });
      throw err;
    }
  }

  function syncNow(): Promise<SyncOutcome | null> {
    if (!inFlight) {
      inFlight = run().finally(() => { inFlight = null; });
    }
    return inFlight;
  }

  function start(): () => void {
    // Boot sync is fire-and-forget; failure lives in getStatus().phase for the chip.
    void syncNow().catch(() => {});
    return addOnlineListener(() => { void syncNow().catch(() => {}); });
  }

  return {
    start,
    syncNow,
    getStatus: () => ({ ...state }),
    subscribe: (cb) => {
      listeners.add(cb);
      cb(state);
      return () => listeners.delete(cb);
    },
  };
}

// ---- Web (browser/WebView) persistence adapters, injected into the boot ------

const SESSION_KEY = 'carbook_device_session';
const DEVICE_KEY = 'carbook_device_id';
const SINCE_KEY = 'carbook_sync_since';

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function makeWebSessionStore(): SessionStore {
  return {
    async load() {
      if (!hasStorage()) return null;
      try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as StoredSession | null;
      } catch {
        return null;
      }
    },
    async save(session) {
      if (hasStorage()) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    },
    async clear() {
      if (hasStorage()) localStorage.removeItem(SESSION_KEY);
    },
  };
}

export function makeWebDeviceIdStore(): DeviceIdStore {
  return {
    async load() {
      return hasStorage() ? localStorage.getItem(DEVICE_KEY) : null;
    },
    async save(id) {
      if (hasStorage()) localStorage.setItem(DEVICE_KEY, id);
    },
  };
}

export function makeWebSinceStore(): { load(): number; save(seq: number): void } {
  return {
    load: () => (hasStorage() ? Number(localStorage.getItem(SINCE_KEY) || '0') || 0 : 0),
    save: (seq) => {
      if (hasStorage()) localStorage.setItem(SINCE_KEY, String(seq));
    },
  };
}
