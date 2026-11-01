import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDatabase } from '../../../src/persistence/db';
import { runSync } from '../../../src/persistence/sync';
import { syncOnce } from '../../../src/sync/client';
import { maintenancePartItemSchema } from '../../../src/domain/schemas';
import { makeDatabase } from './database';
import { WMDBLocalStore } from './localStore';
import { localCreate, localUpdate, localMarkDeleted } from './writer';

// The server (src/persistence/sync.ts) serialises JSON TEXT columns
// (parts_list, specs) before binding, so array-shaped pushes — the contract
// mobile's toSrvValue produces — apply per-row instead of aborting the batch.
// The happy paths below assert that directly.

let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `carbook_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
});
afterEach(() => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

async function seedUser(id: string) {
  const { client } = await getDatabase(dbPath);
  const now = new Date().toISOString();
  await client.execute({
    sql: 'INSERT INTO users (id, email, name, picture, created_at, last_login_at) VALUES (?, ?, ?, NULL, ?, ?)',
    args: [id, `${id}@test.com`, 'T', now, now],
  });
}

// In-process transport: the client POSTs /api/sync, we hand the body straight to
// the real server engine. No HTTP, no mocks of the contract itself.
function fetchToServer(userId: string) {
  return (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    const data = await runSync(userId, body, { dbPath });
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
  }) as typeof fetch;
}

const iso = () => new Date().toISOString();
async function vehiclesOf(db: any) {
  return (await db.collections.get('vehicles').query().fetch()) as any[];
}

describe('device ⇄ server offline sync (end-to-end)', () => {
  it('syncs an offline-created vehicle to the server and a second device', async () => {
    await seedUser('u1');

    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', {
      name: 'Offline Corolla', make: 'Toyota', model: 'Corolla', year: 2019,
      initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso(),
    }, 1000);

    const outA = await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });
    expect(outA.pushedCount).toBe(1);

    const dbB = makeDatabase();
    const outB = await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });
    expect(outB.pulledCount).toBeGreaterThan(0);

    const onB = (await vehiclesOf(dbB)).find(v => v.id === 'veh-1');
    expect(onB?.name).toBe('Offline Corolla');
  });

  it('propagates an offline edit via last-write-wins', async () => {
    await seedUser('u1');
    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', { name: 'Original', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 1000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    await localUpdate(dbA, 'vehicles', 'veh-1', { name: 'Renamed' }, 2000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    const dbB = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });
    expect((await vehiclesOf(dbB)).find(v => v.id === 'veh-1')?.name).toBe('Renamed');
  });

  it('honours last-write-wins when a device pushes a stale edit', async () => {
    await seedUser('u1');
    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', { name: 'Newest', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 5000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    // Device B, offline, edited earlier (ts 1000) but syncs later — must NOT win.
    const dbB = makeDatabase();
    await localCreate(dbB, 'vehicles', 'veh-1', { name: 'Stale', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 1000);
    await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });

    const dbCheck = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbCheck), { baseUrl: 'http://s', deviceId: 'devC', fetchImpl: fetchToServer('u1') });
    expect((await vehiclesOf(dbCheck)).find(v => v.id === 'veh-1')?.name).toBe('Newest');
  });

  it('propagates an offline delete to a peer device', async () => {
    await seedUser('u1');
    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', { name: 'Doomed', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 1000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    const dbB = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });
    expect((await vehiclesOf(dbB)).find(v => v.id === 'veh-1')).toBeTruthy();

    await localMarkDeleted(dbA, 'vehicles', 'veh-1', 2000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });
    expect((await vehiclesOf(dbB)).find(v => v.id === 'veh-1')).toBeUndefined();
  });

  it('isolates one user’s data from another', async () => {
    await seedUser('u1');
    await seedUser('u2');
    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', { name: 'Private', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 1000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    const dbOther = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbOther), { baseUrl: 'http://s', deviceId: 'devX', fetchImpl: fetchToServer('u2') });
    expect(await vehiclesOf(dbOther)).toHaveLength(0);
  });

  it('pushes a maintenance log whose parts_list validates against the real server schema', async () => {
    await seedUser('u1');
    const PARTS = [
      { id: 'p1', name: 'Oil filter', condition: 'new', cost: 15 },
      { name: 'Spark plug', condition: 'used_import', cost: 8.5 },
    ];
    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', { name: 'Corolla', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 1000);
    // Device column is a JSON string; serialize must hand the server a parsed array.
    await localCreate(dbA, 'maintenance_logs', 'log-1', {
      vehicle_id: 'veh-1', service_date: '2026-11-01', odometer: 1200,
      service_type: 'oil_change', title: 'Oil service',
      parts_list: JSON.stringify(PARTS), parts_cost: 23.5, labor_cost: 30, total_cost: 53.5,
      created_at: iso(),
    }, 1000);

    const out = await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });
    expect(out.rejected).toEqual([]);
    expect((await dbA.collections.get('maintenance_logs').find('log-1') as any)._raw._dirty).toBe('');

    // A peer device pulls the log and the parts survive as a valid item array.
    const dbB = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });
    const pulledRaw = (await dbB.collections.get('maintenance_logs').find('log-1') as any)._raw;
    expect(typeof pulledRaw.parts_list).toBe('string');
    const parsed = JSON.parse(pulledRaw.parts_list);
    expect(maintenancePartItemSchema.array().safeParse(parsed).success).toBe(true);
    expect(parsed).toEqual(PARTS);
  });

  it('keeps a per-row-invalid log dirty and flagged through the real server, then accepts the fix', async () => {
    await seedUser('u1');
    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', { name: 'Corolla', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 1000);
    // Malformed parts JSON: the server's Zod pass refuses it with a reason.
    await localCreate(dbA, 'maintenance_logs', 'log-1', {
      vehicle_id: 'veh-1', service_date: '2026-11-01', odometer: 1200,
      service_type: 'oil_change', title: 'Broken parts row', parts_list: '{ not json',
      parts_cost: 0, labor_cost: 30, total_cost: 30, created_at: iso(),
    }, 1000);

    const out = await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });
    expect(out.rejected).toEqual([{ table: 'maintenance_logs', id: 'log-1', reason: expect.stringContaining('partsList') }]);

    const logRaw = (await dbA.collections.get('maintenance_logs').find('log-1') as any)._raw;
    expect(logRaw._dirty).toBe('created'); // refused → never acknowledged
    expect(logRaw.rejected_reason).toContain('partsList');
    // The valid vehicle in the same batch WAS acked.
    expect((await vehiclesOf(dbA)).find(v => v.id === 'veh-1')?._raw._dirty).toBe('');
    // It was not written to the server either: a fresh pull must not contain it.
    const dbB = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });
    expect((await dbB.collections.get('maintenance_logs').query()).length).toBe(0);

    // User fixes the row offline: next sync accepts it and the flag clears.
    await localUpdate(dbA, 'maintenance_logs', 'log-1', { parts_list: JSON.stringify([{ name: 'Gasket', condition: 'new', cost: 5 }]), total_cost: 35 }, 2000);
    const out2 = await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });
    expect(out2.rejected).toEqual([]);
    const fixed = (await dbA.collections.get('maintenance_logs').find('log-1') as any)._raw;
    expect(fixed._dirty).toBe('');
    expect(fixed.rejected_reason).toBe('');

    const dbC = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbC), { baseUrl: 'http://s', deviceId: 'devC', fetchImpl: fetchToServer('u1') });
    expect(JSON.parse((await dbC.collections.get('maintenance_logs').find('log-1') as any)._raw.parts_list)).toEqual([{ name: 'Gasket', condition: 'new', cost: 5 }]);
  });

  it('carries engine_cc through push, an offline edit, and pull without nulling it', async () => {
    await seedUser('u1');
    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', {
      name: 'Corolla', make: 'Toyota', model: 'Corolla', year: 2019, engine_cc: '1496',
      initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso(),
    }, 1000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    // A later offline edit that doesn't touch engine_cc must not blank it server-side.
    await localUpdate(dbA, 'vehicles', 'veh-1', { name: 'Corolla II' }, 2000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    // Server row itself keeps the value (this is what REST/reporting reads).
    const direct = await runSync('u1', { deviceId: 'devProbe', since: 0, pushed: {} }, { dbPath });
    expect(direct.pulled.vehicles?.upsert.find(r => r.id === 'veh-1')?.engine_cc).toBe('1496');

    // And a pulling device sees it on the model.
    const dbB = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });
    const onB = (await vehiclesOf(dbB)).find(v => v.id === 'veh-1');
    expect(onB?.engineCc).toBe('1496');
    expect(onB?.name).toBe('Corolla II');
  });

  it('reports per-row push results in `applied` and omits refused rows', async () => {
    await seedUser('u1');
    const goodVehicle = {
      id: 'veh-1', updatedAt: 1000, name: 'Ok', make: 'Toyota', model: 'A', year: 2020,
      engine_cc: '1500', initial_odometer: 0, current_odometer: 0,
      created_at: iso(), updated_at: iso(),
    };
    const badLog = {
      id: 'log-1', updatedAt: 1000, vehicle_id: 'veh-1', service_date: '2026-11-01',
      odometer: -5, service_type: 'oil_change', title: 'Negative odometer',
      parts_cost: 0, labor_cost: 0, total_cost: 0, created_at: iso(),
    };
    const res = await runSync('u1', {
      deviceId: 'devA', since: 0,
      pushed: { vehicles: { upsert: [goodVehicle] }, maintenance_logs: { upsert: [badLog] } },
    }, { dbPath });

    expect(res.applied).toEqual([{ table: 'vehicles', id: 'veh-1', kind: 'upsert' }]);
    expect(res.rejected).toHaveLength(1);
    expect(res.rejected[0]).toMatchObject({ table: 'maintenance_logs', id: 'log-1', reason: expect.stringContaining('odometer') });
    // Rejected rows must not appear as applied, and future client clocks get clamped.
    expect(JSON.stringify(res.applied)).not.toContain('log-1');
    const v = res.pulled.vehicles?.upsert.find(r => r.id === 'veh-1');
    expect(v?.engine_cc).toBe('1500');
    expect(Number(v?.updatedAt)).toBeLessThanOrEqual(Date.now());
  });
});
