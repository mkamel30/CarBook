// LokiJS persistence adapter backed by localStorage (offline-first core).
//
// Decision (i): loki autosave -> localStorage snapshot. Zero new dependencies;
// the Capacitor WebView's localStorage is app-private and survives restarts.
// The WMDB default (IndexedDB via LokiIndexedAdapter) is left unused: passing
// this adapter through the adapter's documented `_testLokiAdapter` injection
// point makes persistence deterministic in the WebView AND testable in Node
// with an injected storage double.
// Decision (ii) — snapshot to a real file via @capacitor/filesystem (survives
// OS backup tooling) — is deliberately deferred as later hardening.
//
// AGENTS rule 8: every failure path (serialization surprise, size guard,
// storage throw) records an EXPLICIT failure state via `getLastFailure()` and
// the `onFailure` hook, and hands Loki an Error — never a silent give-up. The
// previous good snapshot is kept whenever a new save fails.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistenceFailure {
  at: number;
  reason: string;
}

/** Loki 1.5 legacy adapter contract (same shape as LokiIndexedAdapter). */
export interface LokiSnapshotAdapter {
  loadDatabase(dbName: string, callback: (result: string | Error | null) => void): void;
  saveDatabase(dbName: string, serialized: string, callback: (error?: Error | null) => void): void;
  deleteDatabase(dbName: string, callback: (error?: Error | null) => void): void;
  getLastFailure(): PersistenceFailure | null;
}

/**
 * WebView localStorage quotas are ~5MB per origin (Android WebView historically
 * enforces it on UTF-16 payload size). 4MB UTF-8 budget leaves deliberate
 * headroom for key overhead and encoding variance; exceeding it is a recorded
 * failure, not a silent overwrite.
 */
export const DEFAULT_MAX_SNAPSHOT_BYTES = 4_000_000;

export const DEFAULT_SNAPSHOT_KEY = 'carbook_loki_db';

export function makeLokiLocalStorageAdapter(options: {
  storage: StorageLike;
  key?: string;
  maxBytes?: number;
  onFailure?: (failure: PersistenceFailure) => void;
}): LokiSnapshotAdapter {
  const key = options.key ?? DEFAULT_SNAPSHOT_KEY;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES;
  let lastFailure: PersistenceFailure | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fail(message: string, cause: unknown, callback: (arg: any) => void): void {
    const err = cause instanceof Error ? cause : new Error(String(cause));
    const failure: PersistenceFailure = { at: Date.now(), reason: `${message}: ${err.message}` };
    lastFailure = failure;
    try {
      options.onFailure?.(failure);
    } catch {
      // An observer must never break persistence.
    }
    callback(err);
  }

  return {
    loadDatabase(_dbName, callback) {
      let raw: string | null;
      try {
        raw = options.storage.getItem(key);
      } catch (err) {
        return void fail('snapshot read failed', err, callback);
      }
      // null/undefined = "no data yet" per the Loki adapter contract.
      callback(raw ?? null);
    },
    saveDatabase(_dbName, serialized, callback) {
      if (typeof serialized !== 'string') {
        return void fail('loki handed over a non-string snapshot (serialization failed)',
          new Error(`typeof ${typeof serialized}`), callback);
      }
      let bytes: number;
      try {
        bytes = new TextEncoder().encode(serialized).length;
      } catch (err) {
        return void fail('snapshot size measurement failed', err, callback);
      }
      if (bytes > maxBytes) {
        return void fail(`snapshot ${bytes}B exceeds ${maxBytes}B budget (previous snapshot kept)`,
          new Error('localStorage size guard'), callback);
      }
      try {
        options.storage.setItem(key, serialized);
      } catch (err) {
        return void fail('localStorage setItem failed (quota exceeded?)', err, callback);
      }
      callback(null);
    },
    deleteDatabase(_dbName, callback) {
      try {
        options.storage.removeItem(key);
      } catch (err) {
        return void fail('localStorage removeItem failed', err, callback);
      }
      // Loki's reset-database path rejects on ANY callback argument (even null):
      // successful delete must call back with no args, like LokiMemoryAdapter.
      callback();
    },
    getLastFailure: () => lastFailure,
  };
}

/** localStorage only exists in a browser/WebView; Node tests inject a double. */
export function webLocalStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    const ls = window.localStorage;
    return ls ?? null;
  } catch {
    return null; // throws in some private modes
  }
}
