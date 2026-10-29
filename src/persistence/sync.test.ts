import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDatabase } from './db';
import { runSync } from './sync';

let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `carbook_sync_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
});

afterEach(() => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

async function seedUser(id: string, email: string) {
  const { client } = await getDatabase(dbPath);
  const now = new Date().toISOString();
  await client.execute({
    sql: 'INSERT INTO users (id, email, name, picture, created_at, last_login_at) VALUES (?, ?, ?, NULL, ?, ?)',
    args: [id, email, 'Test', now, now],
  });
}

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

describe('sync contract', () => {
  it('pushes a vehicle and pulls it back', async () => {
    await seedUser('u1', 'u1@test.com');
    const r = await runSync('u1', {
      deviceId: 'd1', since: 0, pushed: { vehicles: { upsert: [veh('v1', 1000)] } },
    }, { dbPath });

    const got = r.pulled.vehicles?.upsert.find(v => v.id === 'v1');
    expect(got?.name).toBe('Car');
    expect(r.serverSeq).toBeGreaterThan(0);
  });

  it('propagates a row from one device to another', async () => {
    await seedUser('u1', 'u1@test.com');
    await runSync('u1', { deviceId: 'dA', since: 0, pushed: { vehicles: { upsert: [veh('v1', 1000)] } } }, { dbPath });
    const p = await runSync('u1', { deviceId: 'dB', since: 0 }, { dbPath });
    expect(p.pulled.vehicles?.upsert.find(v => v.id === 'v1')).toBeTruthy();
  });

  it('ignores an older push (last-write-wins)', async () => {
    await seedUser('u1', 'u1@test.com');
    await runSync('u1', { deviceId: 'd1', since: 0, pushed: { vehicles: { upsert: [veh('v1', 1000, { name: 'Car' })] } } }, { dbPath });
    // Older edit (ts 500) arrives after the newer one (ts 1000) — must be dropped.
    await runSync('u1', { deviceId: 'd1', since: 0, pushed: { vehicles: { upsert: [veh('v1', 500, { name: 'Stale' })] } } }, { dbPath });
    const check = await runSync('u1', { deviceId: 'd9', since: 0 }, { dbPath });
    expect(check.pulled.vehicles?.upsert.find(v => v.id === 'v1')?.name).toBe('Car');
  });

  it('accepts a newer push (last-write-wins)', async () => {
    await seedUser('u1', 'u1@test.com');
    await runSync('u1', { deviceId: 'd1', since: 0, pushed: { vehicles: { upsert: [veh('v1', 1000)] } } }, { dbPath });
    await runSync('u1', { deviceId: 'd1', since: 0, pushed: { vehicles: { upsert: [veh('v1', 2000, { name: 'Renamed' })] } } }, { dbPath });
    const check = await runSync('u1', { deviceId: 'd9', since: 0 }, { dbPath });
    expect(check.pulled.vehicles?.upsert.find(v => v.id === 'v1')?.name).toBe('Renamed');
  });

  it('propagates deletes as tombstones', async () => {
    await seedUser('u1', 'u1@test.com');
    await runSync('u1', { deviceId: 'd1', since: 0, pushed: { vehicles: { upsert: [veh('v1', 1000)] } } }, { dbPath });
    await runSync('u1', { deviceId: 'd1', since: 0, pushed: { vehicles: { delete: [{ id: 'v1', updatedAt: 3000 }] } } }, { dbPath });
    const p = await runSync('u1', { deviceId: 'd2', since: 0 }, { dbPath });
    expect(p.pulled.vehicles?.deleted).toContain('v1');
  });

  it('advances the cursor so a settled client pulls nothing new', async () => {
    await seedUser('u1', 'u1@test.com');
    const r1 = await runSync('u1', { deviceId: 'd1', since: 0, pushed: { vehicles: { upsert: [veh('v1', 1000)] } } }, { dbPath });
    const r2 = await runSync('u1', { deviceId: 'd1', since: r1.serverSeq }, { dbPath });
    expect(r2.pulled.vehicles).toBeUndefined();
    expect(r2.serverSeq).toBe(r1.serverSeq);
  });

  it('rejects a child row pointing at another user vehicle', async () => {
    await seedUser('u1', 'u1@test.com');
    await seedUser('u2', 'u2@test.com');
    await runSync('u2', { deviceId: 'du2', since: 0, pushed: { vehicles: { upsert: [veh('v2', 1000)] } } }, { dbPath });
    const bad = await runSync('u1', { deviceId: 'd1', since: 0, pushed: { fuel_logs: { upsert: [fuel('f1', 'v2', 1000)] } } }, { dbPath });
    expect(bad.rejected.find(x => x.id === 'f1')?.reason).toBe('forbidden');
  });

  it('accepts a child row on an owned vehicle', async () => {
    await seedUser('u1', 'u1@test.com');
    await runSync('u1', { deviceId: 'd1', since: 0, pushed: { vehicles: { upsert: [veh('v1', 1000)] } } }, { dbPath });
    const ok = await runSync('u1', { deviceId: 'd1', since: 0, pushed: { fuel_logs: { upsert: [fuel('f9', 'v1', 1000)] } } }, { dbPath });
    expect(ok.rejected.find(x => x.id === 'f9')).toBeUndefined();
    expect(ok.pulled.fuel_logs?.upsert.find(x => x.id === 'f9')).toBeTruthy();
  });
});
