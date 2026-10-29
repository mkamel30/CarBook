import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { deviceSchema } from './schema';
import { MODELS } from './models';

/**
 * Builds an offline-capable WatermelonDB. In a real Capacitor WebView the LokiJS
 * adapter persists to IndexedDB; in Node/vitest it runs in-memory (no persistence
 * adapter) which is exactly what the e2e tests want.
 */
export function makeDatabase(): Database {
  const adapter = new LokiJSAdapter({
    schema: deviceSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    usePowerOf2Sizes: true,
    useFreeList: true,
  });
  return new Database({ adapter, modelClasses: Object.values(MODELS) as any });
}
