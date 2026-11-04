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

// The server's per-row refusals (src/sync/client.ts remarkRejected hook): a
// refused row must never be acknowledged away — it stays dirty with the reason
// attached so the next sync retries or the user edits it.
describe('device local store: refused rows stay retryable', () => {
  let db: any;
  let store: WMDBLocalStore;

  beforeEach(() => {
    db = makeDatabase();
    store = new WMDBLocalStore(db);
  });

  it('keeps a server-refused row dirty and flags the rejection reason', async () => {
    await localCreate(db, 'vehicles', 'v1', vehicleFields('Bad Year'), 1000);
    await store.collectDirty();
    await store.applyPulled({});
    await store.markSynced(7);
    expect((await rawOf(db, 'vehicles', 'v1'))._dirty).toBe('');

    await store.remarkRejected([{ table: 'vehicles', id: 'v1', reason: 'invalid_payload:year:too big' }]);

    const raw = await rawOf(db, 'vehicles', 'v1');
    expect(raw._dirty).toBe('created');
    expect(raw.rejected_reason).toBe('invalid_payload:year:too big');
    // Retried on the next sync, unchanged.
    const again = await store.collectDirty();
    expect(again.vehicles?.upsert?.[0]?.id).toBe('v1');
  });

  it('clears the flag once the server accepts the revision', async () => {
    await localCreate(db, 'vehicles', 'v1', vehicleFields('Bad'), 1000);
    await store.collectDirty();
    await store.markSynced(7);
    await store.remarkRejected([{ table: 'vehicles', id: 'v1', reason: 'forbidden' }]);

    await store.collectDirty();
    await store.markSynced(9); // accepted this time (no remarkRejected)
    const raw = await rawOf(db, 'vehicles', 'v1');
    expect(raw._dirty).toBe('');
    expect(raw.rejected_reason).toBe('');
  });

  it('a fresh local edit clears the stale refusal and wins the retry', async () => {
    await localCreate(db, 'vehicles', 'v1', vehicleFields('Bad'), 1000);
    await store.collectDirty();
    await store.markSynced(7);
    await store.remarkRejected([{ table: 'vehicles', id: 'v1', reason: 'invalid_payload:year:x' }]);

    await localUpdate(db, 'vehicles', 'v1', { year: 2019 }, 1500);
    expect((await rawOf(db, 'vehicles', 'v1')).rejected_reason).toBe('');
    const pushed = await store.collectDirty();
    expect(pushed.vehicles?.upsert?.[0]).toMatchObject({ id: 'v1', year: 2019, updatedAt: 1500 });
  });

  it('does not re-mark or flag a row the user already re-edited mid-flight', async () => {
    await localCreate(db, 'vehicles', 'v1', vehicleFields('First'), 1000);
    await store.collectDirty();
    await localUpdate(db, 'vehicles', 'v1', { name: 'Newer edit' }, 1500);
    await store.markSynced(7); // rejects the ts-1000 revision only

    await store.remarkRejected([{ table: 'vehicles', id: 'v1', reason: 'invalid_payload:name:x' }]);
    const raw = await rawOf(db, 'vehicles', 'v1');
    expect(raw._dirty).toBe('updated');
    expect(raw.updated_at_sync).toBe(1500);
    expect(raw.rejected_reason).toBe('');
  });

  it('recreates a refused tombstone: purged delete returns as dirty and retries', async () => {
    await localCreate(db, 'vehicles', 'v1', vehicleFields('Kill'), 1000);
    await store.collectDirty();
    await store.markSynced(1); // creation acked
    await localMarkDeleted(db, 'vehicles', 'v1', 2000);

    await store.collectDirty();
    await store.markSynced(2); // believed the delete landed — row purged
    await store.remarkRejected([{ table: 'vehicles', id: 'v1', reason: 'forbidden' }]);

    const raw = await rawOf(db, 'vehicles', 'v1');
    expect(raw._dirty).toBe('deleted');
    expect(raw.name).toBe('Kill');
    expect(raw.rejected_reason).toBe('forbidden');
    const again = await store.collectDirty();
    expect(again.vehicles?.delete).toEqual([{ id: 'v1', updatedAt: 2000 }]);
  });
});

// A4: the device has to say WHICH group it changed, or the server merges the
// whole row by one clock again and an interval edit wipes a peer's service
// baseline (and the other way round). These assert the stamps, not the merge —
// e2e.test.ts drives the same rows through the real server engine.
describe('device stamps each field group separately', () => {
  const schedFields = (over: Record<string, any> = {}) => ({
    vehicle_id: 'v1', item_code: 'oil_change', title_ar: 'تغيير زيت', title_en: 'Oil change',
    interval_km: 5000, interval_months: 6, last_done_odometer: null, last_done_date: null, ...over,
  });

  let db: any;
  let store: WMDBLocalStore;

  beforeEach(() => {
    db = makeDatabase();
    store = new WMDBLocalStore(db);
  });

  async function pushOne() {
    const pushed = await store.collectDirty();
    const row = pushed.maintenance_schedules?.upsert?.[0];
    if (!row) throw new Error('expected the schedule to be in the outbox');
    return row;
  }

  it('a create carries one stamp for both groups — the whole row is new', async () => {
    await localCreate(db, 'maintenance_schedules', 's1', schedFields(), 1000);
    const raw = await rawOf(db, 'maintenance_schedules', 's1');
    expect(raw.updated_at_sync_config).toBe(1000);
    expect(raw.updated_at_sync_baseline).toBe(1000);

    const row = await pushOne();
    expect(row).toMatchObject({ id: 's1', updatedAt: 1000, baselineUpdatedAt: 1000, interval_km: 5000 });
  });

  it('an interval edit moves only the config clock', async () => {
    await localCreate(db, 'maintenance_schedules', 's1', schedFields(), 1000);
    await store.collectDirty();
    await store.markSynced(1);

    await localUpdate(db, 'maintenance_schedules', 's1', { interval_km: 8000 }, 2000);
    const raw = await rawOf(db, 'maintenance_schedules', 's1');
    expect(raw.updated_at_sync_config).toBe(2000);
    expect(raw.updated_at_sync_baseline).toBe(1000); // untouched: the baseline is not newer
    expect(raw.updated_at_sync).toBe(2000);          // row revision still drives the outbox

    expect(await pushOne()).toMatchObject({ interval_km: 8000, updatedAt: 2000, baselineUpdatedAt: 1000 });
  });

  it('a service-baseline advance moves only the baseline clock', async () => {
    await localCreate(db, 'maintenance_schedules', 's1', schedFields(), 1000);
    await store.collectDirty();
    await store.markSynced(1);

    // Exactly what the log→item link writes.
    await localUpdate(db, 'maintenance_schedules', 's1', { last_done_odometer: 45000, last_done_date: '2026-10-05' }, 3000);
    const raw = await rawOf(db, 'maintenance_schedules', 's1');
    expect(raw.updated_at_sync_baseline).toBe(3000);
    expect(raw.updated_at_sync_config).toBe(1000);

    expect(await pushOne()).toMatchObject({ last_done_odometer: 45000, updatedAt: 1000, baselineUpdatedAt: 3000 });
  });

  it('a write that changes config and baseline together stamps both', async () => {
    await localCreate(db, 'maintenance_schedules', 's1', schedFields(), 1000);
    await store.collectDirty();
    await store.markSynced(1);
    await localUpdate(db, 'maintenance_schedules', 's1', { interval_months: 12, last_done_odometer: 600 }, 4000);

    const row = await pushOne();
    expect(row).toMatchObject({ updatedAt: 4000, baselineUpdatedAt: 4000 });
  });

  it('keeps the old row-level behaviour for a row written before the stamps existed', async () => {
    await localCreate(db, 'maintenance_schedules', 's1', schedFields(), 1000);
    // Simulate a snapshot from the released build: no group columns at all.
    await db.write(async () => {
      const rec: any = await db.collections.get('maintenance_schedules').find('s1');
      await rec.update((r: any) => {
        delete r._raw.updated_at_sync_config;
        delete r._raw.updated_at_sync_baseline;
        r._raw._dirty = 'updated';
        r._raw.updated_at_sync = 1700;
      });
    });

    const row = await pushOne();
    expect(row.updatedAt).toBe(1700);
    expect(row.baselineUpdatedAt).toBe(1700);
  });

  it('adopts both server stamps on pull, defaulting a stamp-less server to the row stamp', async () => {
    await store.applyPulled({
      maintenance_schedules: {
        upsert: [
          { id: 's1', vehicle_id: 'v1', item_code: 'oil_change', title_ar: 'x', title_en: 'y',
            interval_km: 5000, updatedAt: 1000, baselineUpdatedAt: 4000, last_done_odometer: 900 },
          { id: 's2', vehicle_id: 'v1', item_code: 'filters', title_ar: 'x', title_en: 'y',
            interval_km: 3000, updatedAt: 2000 },
        ],
        deleted: [],
      },
    });

    const a = await rawOf(db, 'maintenance_schedules', 's1');
    expect([a.updated_at_sync_config, a.updated_at_sync_baseline]).toEqual([1000, 4000]);
    // An older server sends only the row stamp: the baseline inherits it rather
    // than falling to 0, which would let any later push overwrite the baseline.
    const b = await rawOf(db, 'maintenance_schedules', 's2');
    expect([b.updated_at_sync_config, b.updated_at_sync_baseline]).toEqual([2000, 2000]);
  });

  it('leaves ungrouped tables exactly as they were: one stamp, no wire extras', async () => {
    await localCreate(db, 'vehicles', 'v1', vehicleFields('Corolla'), 1000);
    const raw = await rawOf(db, 'vehicles', 'v1');
    expect(raw.updated_at_sync_config).toBeUndefined();
    expect(raw.updated_at_sync_baseline).toBeUndefined();

    const veh = (await store.collectDirty()).vehicles?.upsert?.[0];
    if (!veh) throw new Error('expected the vehicle to be in the outbox');
    expect(Object.keys(veh).sort()).toEqual([
      'created_at', 'current_odometer', 'engine_cc', 'id', 'initial_odometer', 'license_plate',
      'make', 'model', 'name', 'recommended_oil', 'specs', 'updatedAt', 'updated_at', 'year',
    ]);
  });
});

describe('device local store: parts_list JSON round-trip', () => {
  const PARTS = [
    { id: 'p1', name: 'Oil filter', condition: 'new', cost: 15 },
    { name: 'Spark plug', condition: 'used_import', cost: 8.5 },
  ];

  function logFields(parts: unknown) {
    return {
      vehicle_id: 'v1', service_date: '2026-11-01', odometer: 1200,
      service_type: 'oil_change', title: 'Oil service',
      parts_list: parts, parts_cost: 23.5, labor_cost: 30, total_cost: 53.5,
      created_at: iso(),
    };
  }

  let db: any;
  let store: WMDBLocalStore;

  beforeEach(() => {
    db = makeDatabase();
    store = new WMDBLocalStore(db);
  });

  it('pushes the stored JSON string as a parsed array, keeping the column a string', async () => {
    await localCreate(db, 'maintenance_logs', 'log-1', logFields(JSON.stringify(PARTS)), 1000);
    expect(typeof (await rawOf(db, 'maintenance_logs', 'log-1')).parts_list).toBe('string');

    const pushed = await store.collectDirty();
    const row = pushed.maintenance_logs?.upsert?.[0];
    expect(Array.isArray(row?.parts_list)).toBe(true);
    expect(row?.parts_list).toEqual(PARTS);
  });

  it('accepts an array straight into the writer and normalises it to text', async () => {
    await localCreate(db, 'maintenance_logs', 'log-1', logFields(PARTS), 1000);
    const raw = await rawOf(db, 'maintenance_logs', 'log-1');
    expect(typeof raw.parts_list).toBe('string');
    expect(JSON.parse(raw.parts_list)).toEqual(PARTS);
  });

  it('pulls server rows back into the string column, whether parts arrive as text or array', async () => {
    // The live server TEXT column arrives as a JSON string...
    await store.applyPulled({
      maintenance_logs: {
        upsert: [{ id: 'log-1', updatedAt: 500, vehicle_id: 'v1', title: 'X', parts_list: JSON.stringify(PARTS) }],
        deleted: [],
      },
    });
    expect((await rawOf(db, 'maintenance_logs', 'log-1')).parts_list).toBe(JSON.stringify(PARTS));

    // ...and a defensive device-to-device shape (array) is stringified, never stored raw.
    await store.applyPulled({
      maintenance_logs: {
        upsert: [{ id: 'log-1', updatedAt: 600, vehicle_id: 'v1', title: 'X', parts_list: PARTS }],
        deleted: [],
      },
    });
    const raw = await rawOf(db, 'maintenance_logs', 'log-1');
    expect(typeof raw.parts_list).toBe('string');
    expect(JSON.parse(raw.parts_list)).toEqual(PARTS);
  });

  it('sends malformed JSON as-is so the server refuses it per-row instead of dropping it', async () => {
    await localCreate(db, 'maintenance_logs', 'log-1', logFields('{ not json'), 1000);
    const pushed = await store.collectDirty();
    expect(pushed.maintenance_logs?.upsert?.[0]?.parts_list).toBe('{ not json');
  });
});
