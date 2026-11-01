import { describe, it, expect } from 'vitest';
import { makeDatabase } from '@device/database';
import { localCreate, localUpdate } from '@device/writer';
import {
  makeLokiLocalStorageAdapter,
  DEFAULT_SNAPSHOT_KEY,
  type PersistenceFailure,
  type StorageLike,
} from './lokiPersistence';

// Offline-first core promise: writes made before the app is killed must be
// there after a cold restart. These tests use a Map-backed localStorage double
// (Node env has neither window.localStorage nor IndexedDB).

function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** Bounded wait (AGENTS rule 8): loki autosave fires on a 500ms interval. */
async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for loki autosave snapshot');
    await new Promise((res) => setTimeout(res, 50));
  }
}

describe('loki localStorage persistence (reload survival)', () => {
  it('write -> autosave snapshot -> fresh adapter load -> rows intact', async () => {
    const storage = fakeStorage();
    const db1 = makeDatabase({ persistence: makeLokiLocalStorageAdapter({ storage }) });

    await localCreate(db1, 'vehicles', 'veh-restart', {
      name: 'Restart Corolla', make: 'Toyota', model: 'Corolla', year: 2019,
      initial_odometer: 0, current_odometer: 120000, created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }, 1000);
    expect(storage.map.has(DEFAULT_SNAPSHOT_KEY)).toBe(false); // not yet: autosave pending

    await waitFor(() => storage.map.has(DEFAULT_SNAPSHOT_KEY));

    // "App restart": brand-new adapter + brand-new Database over the same storage.
    const db2 = makeDatabase({ persistence: makeLokiLocalStorageAdapter({ storage }) });
    const rows = await db2.collections.get('vehicles').query().fetch();
    const veh = rows.find((r) => r.id === 'veh-restart') as any;
    expect(veh).toBeTruthy();
    expect(veh.name).toBe('Restart Corolla');
    expect(veh.currentOdometer).toBe(120000);
    // Unsynced writes keep their dirty flag across the restart.
    expect(veh.dirty).toBe('created');

    // A second edit round-trips the same way (update path overwrites snapshot).
    await localUpdate(db1, 'vehicles', 'veh-restart', { name: 'Renamed Twice' }, 2000);
    await waitFor(() => (storage.map.get(DEFAULT_SNAPSHOT_KEY) ?? '').includes('Renamed Twice'));
    const db3 = makeDatabase({ persistence: makeLokiLocalStorageAdapter({ storage }) });
    const again = await (await db3.collections.get('vehicles').find('veh-restart')) as any;
    expect(again.name).toBe('Renamed Twice');
  }, 20_000);

  it('size guard: oversized snapshot is refused, previous snapshot kept, failure recorded', () => {
    const storage = fakeStorage();
    const recorded: PersistenceFailure[] = [];
    const adapter = makeLokiLocalStorageAdapter({
      storage, maxBytes: 128, onFailure: (f) => recorded.push(f),
    });

    let firstErr: unknown = 'not-called';
    adapter.saveDatabase('carbook', '{"good":true}', (e) => { firstErr = e; });
    expect(firstErr).toBeNull();

    let err: unknown = 'not-called';
    adapter.saveDatabase('carbook', 'x'.repeat(129), (e) => { err = e; });
    expect(err).toBeInstanceOf(Error);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].reason).toMatch(/exceeds 128B budget/);
    expect(adapter.getLastFailure()?.reason).toMatch(/previous snapshot kept/);
    expect(storage.map.get(DEFAULT_SNAPSHOT_KEY)).toBe('{"good":true}');
  });

  it('storage throwing on setItem (quota) is an explicit failure, not a silent drop', () => {
    const storage = fakeStorage();
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    const adapter = makeLokiLocalStorageAdapter({ storage });
    let err: unknown = 'not-called';
    adapter.saveDatabase('carbook', 'payload', (e) => { err = e; });
    expect(err).toBeInstanceOf(Error);
    expect(adapter.getLastFailure()?.reason).toMatch(/setItem failed \(quota exceeded\?\)/);
  });

  it('load failure surfaces as an Error to loki; delete clears the snapshot', () => {
    const storage = fakeStorage();
    storage.getItem = () => { throw new Error('read blocked'); };
    const adapter = makeLokiLocalStorageAdapter({ storage });
    let loadResult: unknown = 'not-called';
    adapter.loadDatabase('carbook', (r) => { loadResult = r; });
    expect(loadResult).toBeInstanceOf(Error);
    expect(adapter.getLastFailure()?.reason).toMatch(/snapshot read failed/);

    const clean = fakeStorage();
    const adapter2 = makeLokiLocalStorageAdapter({ storage: clean });
    adapter2.saveDatabase('carbook', 'data', () => {});
    adapter2.deleteDatabase('carbook', (e) => expect(e).toBeUndefined());
    expect(clean.map.size).toBe(0);
    // A deleted snapshot loads as "empty database", never an error.
    let loaded: unknown = 'not-called';
    adapter2.loadDatabase('carbook', (r) => { loaded = r; });
    expect(loaded).toBeNull();
  });

  it('non-string serialization is an explicit failure', () => {
    const adapter = makeLokiLocalStorageAdapter({ storage: fakeStorage() });
    let err: unknown = 'not-called';
    adapter.saveDatabase('carbook', {} as unknown as string, (e) => { err = e; });
    expect(err).toBeInstanceOf(Error);
    expect(adapter.getLastFailure()?.reason).toMatch(/non-string snapshot/);
  });
});
