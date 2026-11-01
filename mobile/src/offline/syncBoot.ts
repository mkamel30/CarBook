// Offline sync boot — presentation wrapper around the WP2 sync runtime.
//
// device/runtime.ts createRuntime is the SINGLE SOURCE for the sync loop:
// ensureDeviceId -> ensureSession(guest device) -> syncOnce with bounded
// backoff (MAX_SYNC_ATTEMPTS) and an explicit SyncFailedError state. This
// wrapper only adds what the shell UI needs on top: an offline gate (skip
// before burning retry attempts when there is no server / no connectivity),
// human-readable bilingual status messages, and subscribe() for the chip.
// All side effects (fetch, timers, network events) stay injectable so the
// whole flow runs under Node/vitest.

import type { Database } from '@nozbe/watermelondb';
import { WMDBLocalStore } from '@device/localStore';
import { createRuntime } from '@device/runtime';
import type { SessionStore, StoredSession } from '@device/session';
import type { SyncOutcome } from '@sync/client';

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
    phase: 'idle', message: 'جاهز · Ready', lastSyncedAt: null, lastOutcome: null, guest: false,
  };
  const listeners = new Set<(s: SyncState) => void>();
  let inFlight: Promise<SyncOutcome | null> | null = null;
  let guest = false;

  // The runtime owns the session lifecycle; we still need `guest` for the chip,
  // so observe it through a passthrough store.
  const probingSessionStore: SessionStore = {
    async load() {
      const s = await deps.sessionStore.load();
      if (s) guest = s.guest;
      return s;
    },
    async save(session: StoredSession) {
      guest = session.guest;
      await deps.sessionStore.save(session);
    },
    async clear() {
      guest = false;
      await deps.sessionStore.clear();
    },
  };

  // Single source for the sync transport + backoff (device/runtime.ts). The
  // online listener is owned by THIS wrapper (start() below) because we gate on
  // connectivity before triggering a run — hence a no-op registration for the
  // runtime's own default listener.
  const runtime = createRuntime({
    baseUrl: deps.baseUrl,
    sessionStore: probingSessionStore,
    deviceIdStore: deps.deviceIdStore,
    makeLocalStore: () =>
      new WMDBLocalStore(deps.db, {
        loadSince: () => deps.sinceStore?.load() ?? 0,
        saveSince: (seq) => deps.sinceStore?.save(seq),
      }),
    fetchImpl: deps.fetchImpl,
    addOnlineListener: () => () => {},
  });

  function set(next: Partial<SyncState>): void {
    state = { ...state, ...next };
    for (const cb of listeners) cb(state);
  }

  async function run(): Promise<SyncOutcome | null> {
    if (!deps.baseUrl) {
      set({ phase: 'offline', message: 'وضع محلي · Local only (no server)' });
      return null;
    }
    if (!isOnline()) {
      set({ phase: 'offline', message: 'غير متصل · Offline' });
      return null;
    }
    set({ phase: 'syncing', message: 'جارٍ المزامنة… · Syncing…' });
    try {
      const outcome = await runtime.syncNow();
      set({
        phase: 'synced',
        message: `تمت المزامنة · Synced (+${outcome.pushedCount}/↓${outcome.pulledCount})`,
        lastSyncedAt: Date.now(),
        lastOutcome: outcome,
        guest,
      });
      return outcome;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ phase: 'error', message: `فشل المزامنة · Retry pending: ${message}` });
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
