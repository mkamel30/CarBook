import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDatabase } from '@/persistence/db';
import { runSync } from '@/persistence/sync';

// Focused proof for the sync push-path gaps (found in WP2 device e2e):
//  1. maintenance_logs.parts_list arrives as a real ARRAY (the shared mobile
//     contract: toSrvValue parses the device JSON text so the server's Zod
//     validators see structures). SQLite binds scalars only — the batch must
//     serialise JSON columns instead of aborting with "can only bind…".
//  2. vehicles.updated_at is NOT NULL without a default: a row missing it must
//     be refused per-row (invalid_payload:updated_at:required), never poison
//     the write batch for its valid siblings.

let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `carbook_syncjson_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
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

const iso = () => new Date().toISOString();

function veh(id: string, over: Record<string, any> = {}) {
  return {
    id, name: 'Car', make: 'Toyota', model: 'Corolla', year: 2020,
    license_plate: null, initial_odometer: 0, current_odometer: 100,
    recommended_oil: null, specs: null, created_at: iso(), updated_at: iso(),
    updatedAt: Date.now(), ...over,
  };
}

function log(id: string, vehicleId: string, partsList: unknown, over: Record<string, any> = {}) {
  return {
    id, vehicle_id: vehicleId, service_date: '2026-11-01', odometer: 1200,
    service_type: 'oil_change', title: 'Oil service', parts_list: partsList,
    parts_cost: 23.5, labor_cost: 30, total_cost: 53.5, created_at: iso(),
    updatedAt: Date.now(), ...over,
  };
}

describe('sync push: JSON TEXT columns and NOT NULL guards', () => {
  it('applies a maintenance log whose parts_list is a real array (no batch abort)', async () => {
    await seedUser('u1');
    const PARTS = [
      { id: 'p1', name: 'Oil filter', condition: 'new', cost: 15 },
      { name: 'Spark plug', condition: 'used_import', cost: 8.5 },
    ];

    const r = await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: {
        vehicles: { upsert: [veh('v1')] },
        maintenance_logs: { upsert: [log('l_arr', 'v1', PARTS)] },
      },
    }, { dbPath });

    // Accepted, not rejected, and nothing threw the batch.
    expect(r.rejected).toEqual([]);
    expect(r.applied).toContainEqual({ table: 'maintenance_logs', id: 'l_arr', kind: 'upsert' });

    // Persisted reality: JSON TEXT in the column, exactly the repository's form.
    const { client } = await getDatabase(dbPath);
    const row = await client.execute({ sql: 'SELECT parts_list FROM maintenance_logs WHERE id = ?', args: ['l_arr'] });
    expect(typeof (row.rows[0] as any).parts_list).toBe('string');
    expect(JSON.parse((row.rows[0] as any).parts_list)).toEqual(PARTS);

    // Pull hands the mobile toDeviceValue contract a string it stores as-is.
    const pull = await runSync('u1', { deviceId: 'd2', since: 0 }, { dbPath });
    const pulled = pull.pulled.maintenance_logs?.upsert.find(x => x.id === 'l_arr');
    expect(typeof pulled?.parts_list).toBe('string');
    expect(JSON.parse(String(pulled?.parts_list))).toEqual(PARTS);
  });

  it('accepts a pre-stringified parts_list the same as the parsed array', async () => {
    await seedUser('u1');
    const PARTS = [{ name: 'Gasket', condition: 'new', cost: 5 }];
    const r = await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: {
        vehicles: { upsert: [veh('v1')] },
        maintenance_logs: { upsert: [log('l_str', 'v1', JSON.stringify(PARTS))] },
      },
    }, { dbPath });
    expect(r.rejected).toEqual([]);
    expect(r.applied).toContainEqual({ table: 'maintenance_logs', id: 'l_str', kind: 'upsert' });
  });

  it('refuses a malformed parts_list per-row while valid siblings apply', async () => {
    await seedUser('u1');
    const PARTS = [{ name: 'Filter', condition: 'new', cost: 10 }];
    const r = await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: {
        vehicles: { upsert: [veh('v1')] },
        maintenance_logs: {
          upsert: [
            log('l_ok', 'v1', PARTS),
            log('l_bad', 'v1', '{ not json'),
          ],
        },
      },
    }, { dbPath });
    expect(r.rejected).toEqual([
      { table: 'maintenance_logs', id: 'l_bad', reason: expect.stringContaining('partsList') },
    ]);
    expect(r.applied).toContainEqual({ table: 'maintenance_logs', id: 'l_ok', kind: 'upsert' });
  });

  it('rejects a vehicle push missing updated_at per-row instead of aborting the batch', async () => {
    await seedUser('u1');
    const { updated_at: _omit, ...noUpdatedAt } = veh('v_bad');
    const r = await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: { vehicles: { upsert: [noUpdatedAt as any, veh('v_ok')] } },
    }, { dbPath });

    expect(r.rejected).toEqual([
      { table: 'vehicles', id: 'v_bad', reason: 'invalid_payload:updated_at:required' },
    ]);
    expect(r.applied).toContainEqual({ table: 'vehicles', id: 'v_ok', kind: 'upsert' });

    const { client } = await getDatabase(dbPath);
    const rows = await client.execute({ sql: "SELECT id FROM vehicles WHERE id IN ('v_bad','v_ok')", args: [] });
    expect(rows.rows.map((x: any) => x.id)).toEqual(['v_ok']);
  });

  it('stores a specs object pushed as a structure as JSON TEXT (same guard as parts_list)', async () => {
    await seedUser('u1');
    const SPECS = { engineOilViscosity: '5W-30', fuelTankCapacityLiters: '50' };
    const r = await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: { vehicles: { upsert: [veh('v_specs', { specs: SPECS })] } },
    }, { dbPath });
    expect(r.rejected).toEqual([]);
    const { client } = await getDatabase(dbPath);
    const row = await client.execute({ sql: 'SELECT specs FROM vehicles WHERE id = ?', args: ['v_specs'] });
    expect(JSON.parse((row.rows[0] as any).specs)).toEqual(SPECS);
  });
});
