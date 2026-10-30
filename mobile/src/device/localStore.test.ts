import { describe, it, expect, beforeEach } from 'vitest';
import { Q } from '@nozbe/watermelondb';
import { makeDatabase } from './database';
import { WMDBLocalStore } from './localStore';
import { localCreate, localUpdate, localMarkDeleted } from './writer';

const iso = () => new Date().toISOString();

function vehicleFields(name: string) {
  return {
    name, make: 'Toyota', model: 'Corolla', year: 2019,
    initial_odometer: 0, current_odometer: 0,
    created_at: iso(), updated_at: iso(),
  };
}

async function rawOf(db: any, table: string, id: string): Promise<any> {
  const rec = await db.collections.get(table).find(id);
  return (rec as any)._raw;
}

async function count(db: any, table: string): Promise<number> {
  return (await db.collections.get(table).query()).length;
}

// Drives WMDBLocalStore's four methods in exactly the order syncOnce() does, with
// the network call simulated as the gap between them: whatever the device writes in
// that gap is what the mid-flight tests are about.
describe('device local store: in-flight edits are never lost', () => {
  let db: any;
  let store: WMDBLocalStore;
  let savedSeq: number | undefined;

  beforeEach(() => {
    db = makeDatabase();
    savedSeq = undefined;
    store = new WMDBLocalStore(db, { saveSince: (s) => { savedSeq = s; } });
  });

  it('keeps an edit made after collectDirty() and re-pushes it on the next sync', async () => {
    await localCreate(db, 'vehicles', 'v1', vehicleFields('Original'), 1000);

    await store.collectDirty();
    await localUpdate(db, 'vehicles', 'v1', { name: 'Edited mid-flight' }, 1500);

    // The server answers with the copy it still holds (older than the local edit).
    await store.applyPulled({
      vehicles: { upsert: [{ id: 'v1', updatedAt: 1200, name: 'Server copy' }], deleted: [] },
    });
    await store.markSynced(7);

    const raw = await rawOf(db, 'vehicles', 'v1');
    expect(raw.name).toBe('Edited mid-flight');
    expect(raw._dirty).toBe('updated');
    expect(raw.updated_at_sync).toBe(1500);

    const again = await store.collectDirty();
    expect(again.vehicles?.upsert?.[0]).toMatchObject({ id: 'v1', name: 'Edited mid-flight', updatedAt: 1500 });
  });

  it('keeps a delete made after collectDirty() alive until the server accepts it', async () => {
    await localCreate(db, 'vehicles', 'v1', vehicleFields('Doomed'), 1000);

    await store.collectDirty();
    await localMarkDeleted(db, 'vehicles', 'v1', 1500);

    await store.applyPulled({
      vehicles: { upsert: [{ id: 'v1', updatedAt: 1200, name: 'Doomed' }], deleted: [] },
    });
    await store.markSynced(7);

    const raw = await rawOf(db, 'vehicles', 'v1');
    expect(raw._dirty).toBe('deleted');
    expect(raw.updated_at_sync).toBe(1500);

    const again = await store.collectDirty();
    expect(again.vehicles?.delete).toEqual([{ id: 'v1', updatedAt: 1500 }]);
  });

  it('does not clobber a row created while the request was in flight', async () => {
    await store.collectDirty();
    await localCreate(db, 'vehicles', 'v2', vehicleFields('Brand new'), 2000);

    await store.applyPulled({
      vehicles: { upsert: [{ id: 'v2', updatedAt: 1000, name: 'Pre-existing on server' }], deleted: [] },
    });
    await store.markSynced(4);

    expect((await rawOf(db, 'vehicles', 'v2')).name).toBe('Brand new');
  });

  it('adopts the server value when a push loses last-write-wins', async () => {
    // A peer device already wrote ts 5000, so this push (ts 1000) is dropped by the
    // server. The row is still dirty — its own ack has not arrived — and applying the
    // server copy anyway is what stops the device diverging for good.
    await localCreate(db, 'vehicles', 'v1', vehicleFields('Stale'), 1000);
    await store.collectDirty();

    await store.applyPulled({
      vehicles: { upsert: [{ id: 'v1', updatedAt: 5000, name: 'Newest' }], deleted: [] },
    });
    await store.markSynced(9);

    const raw = await rawOf(db, 'vehicles', 'v1');
    expect(raw.name).toBe('Newest');
    expect(raw._dirty).toBe('');
    expect(raw.updated_at_sync).toBe(5000);
    expect(Object.keys(await store.collectDirty())).toHaveLength(0);
  });

  it('clears the dirty flag and purges an acknowledged tombstone', async () => {
    await localCreate(db, 'vehicles', 'v1', vehicleFields('Synced'), 1000);
    await localCreate(db, 'vehicles', 'v2', vehicleFields('Gone'), 1000);

    const pushed = await store.collectDirty();
    expect(pushed.vehicles?.upsert).toHaveLength(2);
    await store.applyPulled({ vehicles: { upsert: [], deleted: ['v2'] } });
    await store.markSynced(11);

    expect((await rawOf(db, 'vehicles', 'v1'))._dirty).toBe('');
    expect(await count(db, 'vehicles')).toBe(1);
    await expect(rawOf(db, 'vehicles', 'v2')).rejects.toBeTruthy();
    expect(store.getSince()).toBe(11);
    expect(savedSeq).toBe(11);
  });

  it('restores a local row the server refuses to delete', async () => {
    await localCreate(db, 'vehicles', 'v1', vehicleFields('Reprieved'), 1000);
    await store.collectDirty();

    // Our delete was rejected as stale; the server sends the live row back.
    await store.applyPulled({
      vehicles: { upsert: [{ id: 'v1', updatedAt: 4000, name: 'Reprieved', current_odometer: 90 }], deleted: [] },
    });
    await store.markSynced(6);

    const raw = await rawOf(db, 'vehicles', 'v1');
    expect(raw._dirty).toBe('');
    expect(raw.current_odometer).toBe(90);
  });

  it('inserts rows the device has never seen as clean', async () => {
    await store.applyPulled({
      vehicles: { upsert: [{ id: 'v9', updatedAt: 300, name: 'From server', make: 'Honda', year: 2022 }], deleted: [] },
    });
    await store.markSynced(2);

    const raw = await rawOf(db, 'vehicles', 'v9');
    expect(raw.name).toBe('From server');
    expect(raw._dirty).toBe('');
    expect(raw.updated_at_sync).toBe(300);
    expect((await db.collections.get('vehicles').query(Q.where('_dirty', 'created'))).length).toBe(0);
  });

  it('restores the cursor from meta and ignores it when nothing was pushed', async () => {
    const reopened = new WMDBLocalStore(db, { loadSince: () => 42 });
    expect(reopened.getSince()).toBe(42);

    await reopened.collectDirty();
    await reopened.applyPulled({});
    await reopened.markSynced(50);
    expect(reopened.getSince()).toBe(50);
  });
});
