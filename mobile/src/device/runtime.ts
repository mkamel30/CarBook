// Device sync runtime — the glue between the pure sync client (src/sync/client.ts),
// the device session lifecycle (session.ts), and whatever hosts it (App boot, WP1 UI).
//
// No UI and no platform imports: everything side-effectful (fetch, timers, jitter,
// network listeners, the local store) is injected, so the whole loop runs under
// plain vitest with fake timers. The Capacitor APK swaps the injected adapters
// (Preferences-backed session store, real WMDBLocalStore) without touching this.

import { ensureSession, type SessionStore, type StoredSession } from './session';
import {
  syncOnce as syncTransport,
  type LocalStore,
  type SyncOutcome,
} from '../../../src/sync/client';

/** Persistence for the device's stable identity (separate from its tokens). */
export interface DeviceIdStore {
  load(): Promise<string | null>;
  save(id: string): Promise<void>;
}

// AGENTS rule 8: bounded retries with an explicit failure state — never a silent
// give-up. Five attempts (≈ up to 30s of jittered backoff) is the budget.
export const MAX_SYNC_ATTEMPTS = 5;
export const DEFAULT_BACKOFF_BASE_MS = 500;
export const DEFAULT_BACKOFF_MAX_MS = 15_000;

/** Raised when all attempts are spent. `attempts` and `lastError` are explicit. */
export class SyncFailedError extends Error {
  readonly attempts: number;
  readonly lastError: unknown;
  constructor(attempts: number, lastError: unknown) {
    const cause = lastError instanceof Error ? lastError.message : String(lastError);
    super(`sync failed after ${attempts} attempts: ${cause}`);
    this.name = 'SyncFailedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

export interface SyncStatus {
  phase: 'idle' | 'syncing' | 'error';
  lastError: string | null;
  lastErrorAt: number | null;
  lastSyncedAt: number | null;
  lastOutcome: SyncOutcome | null;
}

export interface RuntimeDeps {
  baseUrl: string;
  sessionStore: SessionStore;
  deviceIdStore: DeviceIdStore;
  /** Called per attempt so a rebuilt store is always picked up; tests inject a double. */
  makeLocalStore: () => LocalStore | Promise<LocalStore>;
  fetchImpl?: typeof fetch;
  /** Injectable determinism for tests. */
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Returns a teardown fn. Default binds the browser `online` event when present. */
  addOnlineListener?: (cb: () => void) => () => void;
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface DeviceRuntime {
  /** Boot wiring: one immediate sync + one sync per `online` event. Returns teardown. */
  start(): () => void;
  /** Manual trigger (UI button / login handoff). Concurrent calls share one run. */
  syncNow(): Promise<SyncOutcome>;
  getStatus(): SyncStatus;
}

/** RFC-4122-shaped id with whatever randomness the platform exposes. */
export function newDeviceId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Load the device's stable id, minting and persisting one on first run. */
export async function ensureDeviceId(store: DeviceIdStore): Promise<string> {
  const existing = await store.load();
  if (existing) return existing;
  const id = newDeviceId();
  await store.save(id);
  return id;
}

function defaultAddOnlineListener(cb: () => void): () => void {
  if (typeof globalThis.addEventListener !== 'function') return () => {};
  const handler = () => cb();
  globalThis.addEventListener('online', handler);
  return () => globalThis.removeEventListener('online', handler);
}

export function createRuntime(deps: RuntimeDeps): DeviceRuntime {
  const random = deps.random ?? Math.random;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  const now = deps.now ?? (() => Date.now());
  const maxAttempts = deps.attempts ?? MAX_SYNC_ATTEMPTS;
  const baseMs = deps.baseDelayMs ?? DEFAULT_BACKOFF_BASE_MS;
  const maxMs = deps.maxDelayMs ?? DEFAULT_BACKOFF_MAX_MS;
  const addOnlineListener = deps.addOnlineListener ?? defaultAddOnlineListener;

  let status: SyncStatus = {
    phase: 'idle', lastError: null, lastErrorAt: null, lastSyncedAt: null, lastOutcome: null,
  };
  let inFlight: Promise<SyncOutcome> | null = null;

  async function attemptOnce(): Promise<SyncOutcome> {
    const deviceId = await ensureDeviceId(deps.deviceIdStore);
    const session: StoredSession = await ensureSession(deps.sessionStore, deviceId, {
      baseUrl: deps.baseUrl,
      fetchImpl: deps.fetchImpl,
    });
    const store = await deps.makeLocalStore();
    return syncTransport(store, {
      baseUrl: deps.baseUrl,
      deviceId,
      authToken: session.accessToken,
      fetchImpl: deps.fetchImpl,
    });
  }

  async function runWithBackoff(): Promise<SyncOutcome> {
    status = { ...status, phase: 'syncing' };
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const outcome = await attemptOnce();
        status = {
          ...status, phase: 'idle', lastError: null, lastErrorAt: null,
          lastSyncedAt: now(), lastOutcome: outcome,
        };
        return outcome;
      } catch (err) {
        lastError = err;
        if (attempt === maxAttempts) break;
        // Exponential ceiling, full jitter: delay ∈ [0, min(maxMs, base·2^n)).
        const ceiling = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
        await sleep(random() * ceiling);
      }
    }
    const failure = new SyncFailedError(maxAttempts, lastError);
    status = { ...status, phase: 'error', lastError: failure.message, lastErrorAt: now() };
    throw failure;
  }

  function syncNow(): Promise<SyncOutcome> {
    if (!inFlight) {
      inFlight = runWithBackoff().finally(() => { inFlight = null; });
    }
    return inFlight;
  }

  function start(): () => void {
    // Boot sync and reconnect syncs are fire-and-forget; the explicit failure
    // state lives in getStatus().phase === 'error' for whatever host to show.
    void syncNow().catch(() => {});
    const off = addOnlineListener(() => { void syncNow().catch(() => {}); });
    return off;
  }

  return { start, syncNow, getStatus: () => ({ ...status }) };
}
