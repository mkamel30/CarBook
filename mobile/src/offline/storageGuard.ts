// Persistent-storage guard (A2, part 1).
//
// WHY THIS EXISTS
// The bundled app is offline-first: every vehicle, fuel and service row lives in
// the Capacitor WebView's localStorage (the LokiJS snapshot — see
// device/database.ts + offline/lokiPersistence.ts). localStorage on Android is
// BEST-EFFORT: under storage pressure the OS is free to evict a WebView's origin
// storage, and a "Clear storage" / app-data reset wipes it outright. A user who
// never signed in has NO second copy, so that eviction is silent, permanent data
// loss. `navigator.storage.persist()` asks the browser to exempt this origin from
// automatic eviction — the single cheapest thing we can do to protect a guest's
// only copy. It is not a backup (it survives eviction, not a manual wipe), which
// is exactly why the guest is ALSO warned (see offline/dataSafety.ts).
//
// DESIGN
// Every platform access (navigator.storage, the persist()/persisted() calls) is
// injected, so the whole guard runs under node/vitest with doubles — the same
// rule 8 discipline as syncBoot/backButton. It NEVER rejects: a WebView that
// lacks the API, rejects persist(), or throws on access resolves to an explicit
// outcome the caller can record. persist() also requires user gesture / origin
// constraints on some platforms, so a `false` result is normal, not an error —
// hence `granted` vs `error` are distinct fields, never conflated.

export interface PersistOutcome {
  /** True when the platform exposes `navigator.storage.persist` at all. */
  supported: boolean;
  /** True when storage is (now) persisted — either this call granted it or it already was. */
  granted: boolean;
  /** True only when THIS call was the one that flipped persisted on. */
  newlyGranted: boolean;
  /** Explicit failure message (API threw / rejected). Never a silent give-up (rule 8). */
  error?: string;
}

export interface StorageLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

export interface StorageGuardDeps {
  /** The origin's StorageManager. Defaults to `navigator.storage` when present. */
  storage?: StorageLike | null;
  /** Notified with every outcome (success or failure) so the host can log/observe. */
  onOutcome?: (outcome: PersistOutcome) => void;
}

/** Read `navigator.storage` without assuming a browser (guarded for node/SSR). */
export function webStorageManager(): StorageLike | null {
  if (typeof navigator === 'undefined') return null;
  try {
    const storage = (navigator as { storage?: StorageLike }).storage;
    return storage && typeof storage.persist === 'function' ? storage : null;
  } catch {
    return null; // throws in some hardened/private modes
  }
}

/**
 * Request persistent storage for this origin. Resolves with what happened; never
 * rejects. A `false` grant with no error means the platform declined (quota /
 * gesture policy) — a legitimate, expected state, not a bug.
 */
export async function requestPersistentStorage(deps: StorageGuardDeps = {}): Promise<PersistOutcome> {
  const storage = deps.storage !== undefined ? deps.storage : webStorageManager();
  const settle = (outcome: PersistOutcome): PersistOutcome => {
    try {
      deps.onOutcome?.(outcome);
    } catch {
      // An observer must never break the guard (same rule as the persistence adapter).
    }
    return outcome;
  };

  if (!storage || typeof storage.persist !== 'function') {
    return settle({ supported: false, granted: false, newlyGranted: false });
  }

  // Was it already persisted? A repeat boot must not report "newly granted" and
  // the granted figure is what the host ultimately cares about.
  let already = false;
  if (typeof storage.persisted === 'function') {
    try {
      already = (await storage.persisted()) === true;
    } catch {
      already = false; // a failed read is just "unknown", never fatal
    }
  }

  try {
    const nowGranted = (await storage.persist()) === true;
    return settle({
      supported: true,
      granted: nowGranted,
      newlyGranted: nowGranted && !already,
    });
  } catch (err) {
    return settle({
      supported: true,
      granted: false,
      newlyGranted: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
