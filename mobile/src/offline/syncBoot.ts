// Offline sync boot — presentation wrapper around the WP2 sync runtime.
//
// device/runtime.ts createRuntime is the SINGLE SOURCE for the sync loop:
// ensureDeviceId -> ensureSession(guest device) -> syncOnce with bounded
// backoff (MAX_SYNC_ATTEMPTS) and an explicit SyncFailedError state. This
// wrapper only adds what the shell UI needs on top: an offline gate (skip
// before burning retry attempts when there is no server / no connectivity),
// language-neutral status labels (a dictionary key + vars, resolved by the chip
// in the user's current language), automatic triggers (post-write debounced,
// periodic, foreground-return, `online`) and subscribe() for the chip.
// All side effects (fetch, timers, network events) stay injectable so the
// whole flow runs under Node/vitest.
//
// HOW WRITES ARE DETECTED (A3): every offline write goes through device/writer.ts
// and fires an event on the write bus (device/writeEvents.ts). This wrapper
// subscribes to that bus and arms the post-write debounce the instant a row
// changes — no busy-poll needed. A slow outbox sample (DEFAULT_DIRTY_POLL_MS) is
// kept purely as a safety net: it refreshes the chip's pendingCount and catches a
// dropped event. Observing the `_dirty` column rather than the bridge's internals
// keeps this decoupled from offline/fetchBridge.ts. Using collectDirty() for the
// safety sample would be WRONG, not just inconvenient: it re-snapshots the pending
// queue the transport compares against, so sampling it mid-flight would corrupt
// the "is this revision still unsent" bookkeeping — countDirtyRows is a pure COUNT.

import type { Database } from '@nozbe/watermelondb';
import { countDirtyRows, WMDBLocalStore } from '@device/localStore';
import { createRuntime } from '@device/runtime';
import { onDeviceWrite } from '@device/writeEvents';
import type { SessionStore, StoredSession } from '@device/session';
import type { SyncOutcome } from '@sync/client';
import { DICTIONARIES } from '@app/i18n/config';
import { translate, type TranslateVars } from '@app/i18n/resolve';
import { getCurrentLang } from '@app/i18n/util';

export interface DeviceIdStore {
  load(): Promise<string | null>;
  save(id: string): Promise<void>;
}

export type SyncPhase = 'idle' | 'offline' | 'syncing' | 'synced' | 'error';

export interface SyncState {
  phase: SyncPhase;
  /**
   * Dictionary key of the status line (sync_ready / sync_offline / …). The chip
   * renders it with the CURRENT language, so switching languages re-labels the
   * idle state too — a baked-in string would freeze the old language.
   */
  messageKey: string;
  /** {placeholder} values for `messageKey`. */
  messageVars?: TranslateVars;
  /** `messageKey` resolved at transition time — a readable fallback for consumers without the provider. */
  message: string;
  lastSyncedAt: number | null;
  lastOutcome: SyncOutcome | null;
  guest: boolean;
  /**
   * Rows still queued in the outbox (`_dirty`), or `null` when the boot has not
   * sampled the queue yet (auto sync off and no sync has run).
   */
  pendingCount: number | null;
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
  /**
   * Debounce window (ms) for the post-write auto sync: a burst of writes
   * collapses into ONE run that starts this long after the last one.
   * `0` disables post-write auto sync entirely (pre-auto-sync behaviour).
   */
  autoSyncMs?: number;
  /**
   * Periodic background sync (ms). `0` disables the timer. The manual tap and
   * the `online`/foreground triggers keep working either way.
   */
  syncIntervalMs?: number;
  /** How often (ms) the outbox is sampled as a safety net. Only used when post-write auto sync is on. */
  dirtyPollMs?: number;
  /**
   * Primary post-write trigger (A3): subscribes to the device write bus. Defaults
   * to onDeviceWrite; injected in tests to drive the debounce deterministically.
   */
  addWriteListener?: (cb: () => void) => () => void;
  /**
   * Read-only outbox size. Defaults to `countDirtyRows(db)`. Injected in tests.
   * MUST NOT be a mutating read (see the header comment on collectDirty).
   */
  countDirty?: () => Promise<number> | number;
  /** Registers a foreground/`visibilitychange` listener; returns teardown. */
  addVisibilityListener?: (cb: () => void) => () => void;
  /** One-shot timer seam used for the debounce, the periodic tick and the poll loop. */
  setTimer?: (cb: () => void, ms: number) => () => void;
  /**
   * TEST SEAMS for the retry budget; both forward verbatim to device/runtime.ts,
   * which stays the single source for backoff. Defaults (MAX_SYNC_ATTEMPTS and
   * the standard jitter windows) apply when they are omitted.
   */
  syncAttempts?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}

export interface SyncBoot {
  /** Registers every trigger (boot run, `online`, post-write, periodic, foreground). Returns teardown. */
  start(): () => void;
  syncNow(): Promise<SyncOutcome | null>;
  /** Live outbox size: rows still waiting to be uploaded. */
  pendingCount(): Promise<number>;
  getStatus(): SyncState;
  subscribe(cb: (state: SyncState) => void): () => void;
}

// Post-write debounce: long enough that filling a whole log form counts as one
// write, short enough that the user never has to tap to get data off the device.
export const DEFAULT_AUTO_SYNC_MS = 1500;
// Background sweep for devices that sit open (or idle) without new writes: 5 min.
export const DEFAULT_SYNC_INTERVAL_MS = 5 * 60_000;
// Outbox sampling is now only a SAFETY NET (A3). The primary post-write trigger
// is the write-event bus (device/writeEvents.ts), fired by every writer call, so
// we no longer need a fast poll. This slow interval only exists to refresh the
// chip's pendingCount and to catch a dropped event — one COUNT per table per 30s.
export const DEFAULT_DIRTY_POLL_MS = 30_000;
// After an automatic run fails with rows still queued, the retry is rescheduled
// with autoSyncMs * 2^n. Bounded: n never exceeds this, so the wait caps out at
// 8x the debounce window instead of growing forever, and each attempt re-enters
// the runtime's own bounded backoff (never bypasses it).
const MAX_AUTO_RETRY_STEPS = 3;

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

function defaultAddVisibilityListener(cb: () => void): () => void {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return () => {};
  const handler = () => {
    if (document.visibilityState === 'visible') cb();
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

function defaultSetTimer(cb: () => void, ms: number): () => void {
  const id = setTimeout(cb, Math.max(0, ms));
  return () => clearTimeout(id);
}

export function createSyncBoot(deps: SyncBootDeps): SyncBoot {
  const isOnline = deps.isOnline ?? defaultOnline;
  const addOnlineListener = deps.addOnlineListener ?? defaultAddOnlineListener;
  const addVisibilityListener = deps.addVisibilityListener ?? defaultAddVisibilityListener;
  const addWriteListener = deps.addWriteListener ?? onDeviceWrite;
  const setTimer = deps.setTimer ?? defaultSetTimer;
  const countDirty = deps.countDirty ?? (() => countDirtyRows(deps.db));
  const autoSyncMs = deps.autoSyncMs ?? DEFAULT_AUTO_SYNC_MS;
  const syncIntervalMs = deps.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
  const dirtyPollMs = deps.dirtyPollMs ?? DEFAULT_DIRTY_POLL_MS;
  // Post-write auto sync is a single feature: the outbox watcher exists only to
  // feed the debounce, so `autoSyncMs: 0` switches the watcher off too and the
  // boot behaves exactly as it did before auto sync existed.
  const writeSyncEnabled = autoSyncMs > 0;

  // Status lines are carried as a dictionary key + vars (see SyncState) so the
  // chip always renders them in the language the user has selected right now.
  function label(messageKey: string, messageVars?: TranslateVars): Pick<SyncState, 'messageKey' | 'messageVars' | 'message'> {
    return {
      messageKey,
      messageVars,
      message: translate(DICTIONARIES, getCurrentLang(), messageKey, messageVars),
    };
  }

  let state: SyncState = {
    phase: 'idle', ...label('sync_ready'), lastSyncedAt: null, lastOutcome: null, guest: false,
    pendingCount: null,
  };
  const listeners = new Set<(s: SyncState) => void>();
  let inFlight: Promise<SyncOutcome | null> | null = null;
  let guest = false;

  // Timer teardowns, filled by start(). `autoTimerOff` is the live debounce
  // window; the poll/periodic loops reschedule themselves through it.
  let autoTimerOff: (() => void) | null = null;
  const teardowns: Array<() => void> = [];
  let stopped = true;
  // Last outbox sample the watcher saw, so "new writes" means the count grew.
  let lastDirty = 0;
  // Consecutive automatic failures, used only to stretch the retry wait (capped
  // by MAX_AUTO_RETRY_STEPS). Reset by any successful run.
  let autoFailures = 0;

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
    // Optional test seams; undefined keeps runtime.ts' own defaults.
    attempts: deps.syncAttempts,
    baseDelayMs: deps.backoffBaseMs,
    maxDelayMs: deps.backoffMaxMs,
  });

  function set(next: Partial<SyncState>): void {
    state = { ...state, ...next };
    for (const cb of listeners) cb(state);
  }

  async function readOutbox(): Promise<number> {
    try {
      return Math.max(0, await countDirty());
    } catch {
      // A failed count is NOT "0 pending": keep the last known figure so the
      // chip never claims the queue drained when the read itself broke.
      return state.pendingCount ?? lastDirty;
    }
  }

  /**
   * Arm (or re-arm) the post-write debounce. Restarting the single timer is what
   * coalesces a burst of writes into one run; `syncNow()`'s `inFlight` guard is
   * the second half, so a trigger that lands mid-run never starts a parallel one.
   */
  function scheduleAuto(delayMs: number): void {
    if (!writeSyncEnabled || stopped) return;
    if (autoTimerOff) autoTimerOff();
    autoTimerOff = setTimer(() => {
      autoTimerOff = null;
      void syncNow().catch(() => {});
    }, delayMs);
  }

  /** Outbox watcher: sample the queue; a growing queue means local writes happened. */
  async function pollOutbox(): Promise<void> {
    if (stopped) return;
    const count = await readOutbox();
    const grew = count > lastDirty;
    if (count !== state.pendingCount) set({ pendingCount: count });
    lastDirty = count;
    // 0 -> >0 and ">0 -> even more" are both "the user just wrote something".
    if (grew) scheduleAuto(autoSyncMs);
  }

  function schedulePollLoop(): void {
    if (!writeSyncEnabled || stopped) return;
    setTimer(() => {
      void pollOutbox().finally(() => schedulePollLoop());
    }, dirtyPollMs);
  }

  function scheduleTickLoop(): void {
    if (syncIntervalMs <= 0 || stopped) return;
    setTimer(() => {
      void syncNow().catch(() => {});
      scheduleTickLoop();
    }, syncIntervalMs);
  }

  async function run(): Promise<SyncOutcome | null> {
    if (!deps.baseUrl) {
      set({ phase: 'offline', ...label('sync_local_only') });
      return null;
    }
    if (!isOnline()) {
      set({ phase: 'offline', ...label('sync_offline') });
      return null;
    }
    set({ phase: 'syncing', ...label('sync_syncing') });
    try {
      const outcome = await runtime.syncNow();
      autoFailures = 0;
      set({
        phase: 'synced',
        ...label('sync_synced', { pushed: outcome.pushedCount, pulled: outcome.pulledCount }),
        lastSyncedAt: Date.now(),
        lastOutcome: outcome,
        guest,
      });
      // The ack cleared (some of) the queue; refresh the figure the chip shows.
      const pending = await readOutbox();
      lastDirty = pending;
      if (pending !== state.pendingCount) set({ pendingCount: pending });
      return outcome;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Explicit failure, with the queue size still on display: an error must
      // never look like a silent success while rows wait to upload.
      const pending = await readOutbox();
      set({ phase: 'error', ...label('sync_failed', { message }), pendingCount: pending });
      // And it must retry on its own: bounded stretch of the wait, and each
      // attempt goes back through the runtime's own MAX_SYNC_ATTEMPTS backoff.
      if (pending > 0) {
        autoFailures = Math.min(autoFailures + 1, MAX_AUTO_RETRY_STEPS);
        scheduleAuto(autoSyncMs * 2 ** autoFailures);
      } else {
        autoFailures = 0;
      }
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
    stopped = false;
    // Boot sync is fire-and-forget; failure lives in getStatus().phase for the chip.
    void syncNow().catch(() => {});
    teardowns.push(addOnlineListener(() => { void syncNow().catch(() => {}); }));
    // A3 primary trigger: a local write arms the debounce immediately and refreshes
    // the chip's pending figure. The debouncer coalesces a burst into one run, and
    // scheduleAuto restarts the single timer so we never stack syncs.
    if (writeSyncEnabled) {
      teardowns.push(addWriteListener(() => {
        scheduleAuto(autoSyncMs);
        void pollOutbox();
      }));
    }
    // Returning to the foreground: flush what the queue already holds, no wait.
    if (writeSyncEnabled || syncIntervalMs > 0) {
      teardowns.push(addVisibilityListener(() => {
        if (!isOnline()) return;
        void readOutbox().then((n) => {
          lastDirty = n;
          if (n > 0) void syncNow().catch(() => {});
        });
      }));
    }
    schedulePollLoop();
    scheduleTickLoop();

    let torn = false;
    return () => {
      if (torn) return;
      torn = true;
      stopped = true;
      if (autoTimerOff) autoTimerOff();
      autoTimerOff = null;
      for (const off of teardowns) off();
      teardowns.length = 0;
    };
  }

  return {
    start,
    syncNow,
    pendingCount: readOutbox,
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
