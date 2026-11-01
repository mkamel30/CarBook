import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDatabase } from '@/persistence/db';
import { runSync } from '@/persistence/sync';
import { syncOnce, type LocalStore, type PushPayload, type PulledTable } from '@/sync/client';
import { StorageRepository } from '@/persistence/repository';

// Sync correctness slice (T3): REST mutations must stamp seq so their effects
// ship on the next pull without a server restart, log deletes must propagate as
// tombstones (never hard deletes), the push path must Zod-validate rows per-row,
// and future-dated client clocks must never outrank server state.

let dbPath: string;
let repo: StorageRepository;

beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), `carbook_synccorrect_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
  repo = new StorageRepository(dbPath);
  await repo.findOrCreateUser({ id: 'u1', email: 'u1@test.com', name: 'U1' });
});

afterEach(async () => {
  try { await repo.close(); } catch { /* ignore */ }
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

function veh(id: string, updatedAt: number, over: Record<string, any> = {}) {
  const iso = new Date().toISOString();
  return {
    id, name: 'Car', make: 'Toyota', model: 'Corolla', year: 2020,
    license_plate: null, initial_odometer: 0, current_odometer: 100,
    recommended_oil: null, specs: null, created_at: iso, updated_at: iso,
    updatedAt, ...over,
  };
}

function fuel(id: string, vehicleId: string, updatedAt: number, over: Record<string, any> = {}) {
  return {
    id, vehicle_id: vehicleId, fill_date: '2026-01-01', odometer: 100, liters: 40,
    price_per_liter: 5, total_cost: 200, is_full_tank: true, notes: null,
    created_at: new Date().toISOString(), updatedAt, ...over,
  };
}

describe('sync correctness — seq stamping on REST-path mutations (T3.1)', () => {
  it('a repository edit stamps seq and another device receives it without a server restart', async () => {
    const vehicle = await repo.createVehicle(
      { name: 'Server Car', make: 'Toyota', model: 'Corolla', year: 2022, initialOdometer: 1000, currentOdometer: 1000 },
      'u1',
    );

    // Device A settles: pulls creation (seq was stamped even before the edit).
    const r0 = await runSync('u1', { deviceId: 'devA', since: 0 }, { dbPath });
    expect(r0.pulled.vehicles?.upsert.find(v => v.id === vehicle.id)).toBeTruthy();

    // A REST-path edit (no sync push, no restart) must move the row's seq…
    await repo.updateVehicle(vehicle.id!, { name: 'Edited On Server', currentOdometer: 1500 }, 'u1');
    const r1 = await runSync('u1', { deviceId: 'devB', since: r0.serverSeq }, { dbPath });
    const got = r1.pulled.vehicles?.upsert.find(v => v.id === vehicle.id);
    expect(got?.name).toBe('Edited On Server');
    expect(got?.current_odometer).toBe(1500);

    // …and so must a fuel log write, including the vehicle odometer bump.
    const log = await repo.addFuelLog({
      vehicleId: vehicle.id!, fillDate: '2026-02-01', odometer: 2000, liters: 30,
      pricePerLiter: 10, totalCost: 300, isFullTank: true,
    });
    const r2 = await runSync('u1', { deviceId: 'devC', since: r1.serverSeq }, { dbPath });
    expect(r2.pulled.fuel_logs?.upsert.find(f => f.id === log.id)).toBeTruthy();
    expect(r2.pulled.vehicles?.upsert.find(v => v.id === vehicle.id)?.current_odometer).toBe(2000);

    // Every sync-visible row now carries a seq (no NULL holes for the pull cursor).
    const { client } = await getDatabase(dbPath);
    for (const t of ['vehicles', 'fuel_logs', 'maintenance_logs', 'maintenance_schedules']) {
      const res = await client.execute({ sql: `SELECT COUNT(*) AS c FROM ${t} WHERE seq IS NULL`, args: [] });
      expect(Number((res.rows[0] as any).c)).toBe(0);
    }
  });

  it('deleteVehicle cascade stamps seq on every child tombstone so pull sees them all', async () => {
    const vehicle = await repo.createVehicle(
      { name: 'Doomed', make: 'Nissan', model: 'Sunny', year: 2021, initialOdometer: 10, currentOdometer: 10 },
      'u1',
    );
    await repo.addFuelLog({
      vehicleId: vehicle.id!, fillDate: '2026-02-01', odometer: 20, liters: 10,
      pricePerLiter: 10, totalCost: 100, isFullTank: true,
    });
    const base = await runSync('u1', { deviceId: 'devA', since: 0 }, { dbPath });

    await repo.deleteVehicle(vehicle.id!, 'u1');
    const after = await runSync('u1', { deviceId: 'devB', since: base.serverSeq }, { dbPath });
    expect(after.pulled.vehicles?.deleted).toContain(vehicle.id);
    const { client } = await getDatabase(dbPath);
    const res = await client.execute({
      sql: 'SELECT COUNT(*) AS c FROM fuel_logs WHERE deleted = 1 AND seq IS NOT NULL', args: [],
    });
    expect(Number((res.rows[0] as any).c)).toBe(1);
  });
});

describe('sync correctness — tombstones replace hard deletes (T3.2)', () => {
  it('a fuel log deleted via the repository propagates as a tombstone and is not resurrected', async () => {
    const vehicle = await repo.createVehicle(
      { name: 'Tomb Car', make: 'Toyota', model: 'Yaris', year: 2020, initialOdometer: 0, currentOdometer: 0 },
      'u1',
    );
    const log = await repo.addFuelLog({
      vehicleId: vehicle.id!, fillDate: '2026-03-01', odometer: 100, liters: 20,
      pricePerLiter: 10, totalCost: 200, isFullTank: true,
    });

    // Device A settles, then the row is deleted server-side (REST path).
    const rA = await runSync('u1', { deviceId: 'devA', since: 0 }, { dbPath });
    expect(rA.pulled.fuel_logs?.upsert.find(f => f.id === log.id)).toBeTruthy();
    await repo.deleteFuelLog(log.id!);

    // Another device pulling from scratch must receive the tombstone, not silence.
    const rB = await runSync('u1', { deviceId: 'devB', since: 0 }, { dbPath });
    expect(rB.pulled.fuel_logs?.deleted).toContain(log.id);
    expect(rB.pulled.fuel_logs?.upsert.find(f => f.id === log.id)).toBeUndefined();

    // A stale device that never saw the delete pushes its old copy: refused, no revival.
    const tsBefore = rB.serverSeq;
    const rC = await runSync('u1', {
      deviceId: 'devStale', since: 0,
      pushed: { fuel_logs: { upsert: [fuel(log.id!, vehicle.id!, Date.now() - 60_000)] } },
    }, { dbPath });
    expect(rC.applied?.find(a => a.id === log.id)).toBeUndefined();

    const rD = await runSync('u1', { deviceId: 'devD', since: tsBefore }, { dbPath });
    expect(rD.pulled.fuel_logs?.upsert.find(f => f.id === log.id)).toBeUndefined();
    const { client } = await getDatabase(dbPath);
    const row = await client.execute({ sql: 'SELECT deleted FROM fuel_logs WHERE id = ?', args: [log.id!] });
    expect(Number((row.rows[0] as any).deleted)).toBe(1);
  });

  it('maintenance log deletes are tombstones too, and reads stop returning them', async () => {
    const vehicle = await repo.createVehicle(
      { name: 'Maint Tomb', make: 'Renault', model: 'Megane', year: 2019, initialOdometer: 0, currentOdometer: 0 },
      'u1',
    );
    const mlog = await repo.addMaintenanceLog({
      vehicleId: vehicle.id!, serviceDate: '2026-03-02', odometer: 300, serviceType: 'oil_change',
      title: 'زيت', partsCost: 0, laborCost: 0, totalCost: 500,
    });
    await repo.deleteMaintenanceLog(mlog.id!);

    expect(await repo.getMaintenanceLogsByVehicle(vehicle.id!)).toHaveLength(0);
    const r = await runSync('u1', { deviceId: 'devE', since: 0 }, { dbPath });
    expect(r.pulled.maintenance_logs?.deleted).toContain(mlog.id);
  });
});

describe('sync client per-row refusals (T3.3 client side)', () => {
  it('re-marks exactly the rejected rows via the optional remarkRejected hook', async () => {
    class Store implements LocalStore {
      since = 0;
      cleared = false;
      reMarked: Array<{ table: string; id: string; reason: string }> = [];
      getSince() { return this.since; }
      collectDirty(): PushPayload { return { fuel_logs: { upsert: [{ id: 'x', updatedAt: 1 }] } }; }
      applyPulled(_p: Record<string, PulledTable>) { /* noop */ }
      markSynced(seq: number) { this.since = seq; this.cleared = true; }
      remarkRejected(r: Array<{ table: string; id: string; reason: string }>) {
        // must only run after the cursor advanced (dirty cleared), then re-mark
        expect(this.cleared).toBe(true);
        this.reMarked = r;
      }
    }
    const store = new Store();
    const fetchImpl = (async () => ({
      ok: true, status: 200,
      json: async () => ({
        success: true,
        data: {
          serverSeq: 9,
          pulled: {},
          rejected: [{ table: 'fuel_logs', id: 'x', reason: 'invalid_payload:liters:positive' }],
        },
      }),
    })) as any;

    const out = await syncOnce(store, { baseUrl: 'http://x', deviceId: 'd1', fetchImpl });
    expect(store.since).toBe(9);
    expect(store.reMarked).toEqual([{ table: 'fuel_logs', id: 'x', reason: 'invalid_payload:liters:positive' }]);
    expect(out.rejected).toHaveLength(1);
  });

  it('older stores without the optional hook are unaffected (backward compatible)', async () => {
    const state = { since: 3 };
    const store: LocalStore = {
      getSince() { return state.since; },
      collectDirty() { return {}; },
      applyPulled() { /* noop */ },
      markSynced(seq: number) { state.since = seq; },
    };
    const fetchImpl = (async () => ({
      ok: true, status: 200,
      json: async () => ({ success: true, data: { serverSeq: 5, pulled: {}, rejected: [{ table: 'vehicles', id: 'v', reason: 'forbidden' }] } }),
    })) as any;
    const out = await syncOnce(store, { baseUrl: 'http://x', deviceId: 'd1', fetchImpl });
    expect(state.since).toBe(5);
    expect(out.rejected).toHaveLength(1);
  });
});

describe('sync correctness — push validation and clock clamp (T3.3/T3.4)', () => {
  it('refuses invalid push rows per-row while valid siblings still apply', async () => {
    const vehicle = await repo.createVehicle(
      { name: 'Validated', make: 'Honda', model: 'Civic', year: 2021, initialOdometer: 0, currentOdometer: 0 },
      'u1',
    );
    const ts = Date.now();
    const r = await runSync('u1', {
      deviceId: 'devF', since: 0,
      pushed: {
        fuel_logs: {
          upsert: [
            fuel('f_ok', vehicle.id!, ts),
            fuel('f_neg', vehicle.id!, ts + 1, { odometer: -50 }),        // negative odometer
            fuel('f_str', vehicle.id!, ts + 2, { liters: 'thirty' }),     // non-numeric string liters
            fuel('f_miss', vehicle.id!, ts + 3, { fill_date: null }),     // missing required column
          ],
        },
      },
    }, { dbPath });

    const reasons = Object.fromEntries(r.rejected.map(x => [x.id, x.reason]));
    expect(reasons['f_neg']).toMatch(/^invalid_payload:odometer/);
    expect(reasons['f_str']).toMatch(/^invalid_payload:liters/);
    expect(reasons['f_miss']).toMatch(/^invalid_payload:fill_date/);
    expect(r.rejected.find(x => x.id === 'f_ok')).toBeUndefined();

    // Valid sibling applied and visible; refused rows are reported in `applied`-absence
    // so a client can keep exactly them dirty.
    expect(r.applied).toContainEqual({ table: 'fuel_logs', id: 'f_ok', kind: 'upsert' });
    for (const bad of ['f_neg', 'f_str', 'f_miss']) {
      expect(r.applied?.find(a => a.id === bad)).toBeUndefined();
    }
    const check = await runSync('u1', { deviceId: 'devG', since: 0 }, { dbPath });
    expect(check.pulled.fuel_logs?.upsert.find(f => f.id === 'f_ok')).toBeTruthy();
    expect(check.pulled.fuel_logs?.upsert.find(f => f.id === 'f_neg')).toBeUndefined();
  });

  it('coerces declared int/real columns so numeric strings land as numbers', async () => {
    const r = await runSync('u1', {
      deviceId: 'devH', since: 0,
      pushed: { vehicles: { upsert: [veh('v_co', Date.now(), { year: '2019', current_odometer: '150' })] } },
    }, { dbPath });
    expect(r.rejected.find(x => x.id === 'v_co')).toBeUndefined();
    const { client } = await getDatabase(dbPath);
    const row = await client.execute({ sql: 'SELECT year, current_odometer FROM vehicles WHERE id = ?', args: ['v_co'] });
    expect(Number((row.rows[0] as any).year)).toBe(2019);
    expect((row.rows[0] as any).current_odometer).toBe(150);
  });

  it('a future-dated client timestamp never wins against a server row', async () => {
    const vehicle = await repo.createVehicle(
      { name: 'Clock Car', make: 'Toyota', model: 'Corolla', year: 2022, initialOdometer: 0, currentOdometer: 0 },
      'u1',
    );
    await repo.updateVehicle(vehicle.id!, { name: 'Server Wins' }, 'u1');

    // Device with a clock 10 days ahead tries to overwrite the server copy.
    const farFuture = Date.now() + 10 * 24 * 3600 * 1000;
    const r = await runSync('u1', {
      deviceId: 'devSkew', since: 0,
      pushed: { vehicles: { upsert: [veh(vehicle.id!, farFuture, { name: 'Future Hack' })] } },
    }, { dbPath });
    expect(r.applied?.find(a => a.id === vehicle.id)).toBeUndefined();

    const after = await runSync('u1', { deviceId: 'devJ', since: 0 }, { dbPath });
    expect(after.pulled.vehicles?.upsert.find(v => v.id === vehicle.id)?.name).toBe('Server Wins');
    expect(await repo.getVehicleById(vehicle.id!, 'u1')).toMatchObject({ name: 'Server Wins' });
  });
});
