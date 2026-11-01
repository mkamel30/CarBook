import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { deviceSchema } from './schema';
import { MODELS } from './models';
import {
  makeLokiLocalStorageAdapter,
  webLocalStorage,
  type LokiSnapshotAdapter,
  type PersistenceFailure,
} from '../offline/lokiPersistence';

/**
 * Builds an offline-capable WatermelonDB with reload-surviving persistence.
 *
 * Browser/Capacitor WebView: loki autosave (500ms) serializes the whole DB into
 * a localStorage snapshot via our injected adapter — data survives app restarts
 * (offline-first core promise). Node/vitest: no `window`, so the adapter option
 * is skipped and the driver falls back to its in-memory default — exactly what
 * e2e tests want, so behavior there is unchanged.
 *
 * The injection point is the adapter's internal `_testLokiAdapter` option: the
 * only documented way to hand WMDB's LokiJSAdapter a custom Loki persistence
 * adapter (its type is `any`; it bypasses the IndexedDB autodetection).
 */
export interface MakeDatabaseOptions {
  /**
   * Explicit persistence adapter (tests inject a Map-backed storage double).
   * 'memory' forces the in-memory default even where localStorage exists.
   * Omitted = auto: localStorage snapshot in a browser, memory in Node.
   */
  persistence?: LokiSnapshotAdapter | 'memory';
  dbName?: string;
}

// The app has exactly one shared Database (offline/db.ts); remembering its
// snapshot adapter lets the shell surface persistence failures (AGENTS rule 8).
let activeSnapshotAdapter: LokiSnapshotAdapter | null = null;

/** Last persistence failure recorded by the active adapter, or null = healthy. */
export function getPersistenceFailure(): PersistenceFailure | null {
  return activeSnapshotAdapter?.getLastFailure() ?? null;
}

export function makeDatabase(options: MakeDatabaseOptions = {}): Database {
  const dbName = options.dbName ?? 'carbook';
  const auto = webLocalStorage();
  const snapshot =
    options.persistence === 'memory'
      ? null
      : options.persistence ??
        (auto
          ? makeLokiLocalStorageAdapter({
              storage: auto,
              // Explicit failure state (AGENTS rule 8): a dropped save must be
              // loud in the WebView console, not silently skipped. UI surfacing
              // is task #17/#20 territory; the record stays in getPersistenceFailure().
              onFailure: (f) => console.error('[carbook] persistence failure:', f.reason),
            })
          : null);
  activeSnapshotAdapter = snapshot ?? null;

  // `_testLokiAdapter` is WMDB's internal injection point (typed any); keeping
  // the options in an untyped bag avoids fighting the $Exact option type.
  const lokiOptions = {
    dbName,
    schema: deviceSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    ...(snapshot ? { _testLokiAdapter: snapshot } : {}),
  };
  const adapter = new LokiJSAdapter(lokiOptions as never);
  return new Database({ adapter, modelClasses: Object.values(MODELS) as any });
}
