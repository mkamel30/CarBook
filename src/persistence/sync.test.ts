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

function sched(id: string, vehicleId: string, updatedAt: number, over: Record<string, any> = {}) {
  return {
    id, vehicle_id: vehicleId, item_code: 'oil_change', title_ar: 'تغيير زيت', title_en: 'Oil change',
    interval_km: 5000, interval_months: 6, last_done_odometer: null, last_done_date: null,
    updatedAt, ...over,
  };
}

/** Read the server's own schedule row back through a fresh device's pull. */
async function pullSchedule(userId: string, id: string) {
  const probe = await runSync(userId, { deviceId: 'probe', since: 0 }, { dbPath });
  return probe.pulled.maintenance_schedules?.upsert.find(s => s.id === id);
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

  it('accepts a vehicle and its logs in one request', async () => {
    await seedUser('u1', 'u1@test.com');
    const r = await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: { vehicles: { upsert: [veh('v1', 1000)] }, fuel_logs: { upsert: [fuel('f1', 'v1', 1000)] } },
    }, { dbPath });

    // The child's parent is only accepted in this same call, so the ownership check
    // has to consider the request, not just what is already on disk.
    expect(r.rejected).toEqual([]);
    expect(r.pulled.fuel_logs?.upsert.find(f => f.id === 'f1')).toBeTruthy();
  });

  it('still rejects a child attached to a vehicle owned by someone else', async () => {
    await seedUser('u1', 'u1@test.com');
    await seedUser('u2', 'u2@test.com');
    await runSync('u1', { deviceId: 'dA', since: 0, pushed: { vehicles: { upsert: [veh('v1', 1000)] } } }, { dbPath });

    const r = await runSync('u2', {
      deviceId: 'dB', since: 0,
      pushed: { fuel_logs: { upsert: [fuel('fX', 'v1', 1000)] } },
    }, { dbPath });

    expect(r.rejected).toContainEqual({ table: 'fuel_logs', id: 'fX', reason: 'forbidden' });
    const check = await runSync('u2', { deviceId: 'dC', since: 0 }, { dbPath });
    expect(check.pulled.fuel_logs).toBeUndefined();
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

// A4: a schedule row has two independent writers — the owner tuning the item and
// the log→item link advancing its service baseline. Row-level last-write-wins let
// whichever pushed second overwrite columns it never touched.
describe('per-field-group last-write-wins on maintenance_schedules', () => {
  it('keeps a newer interval when a baseline-only edit arrives with a stale config copy', async () => {
    await seedUser('u1', 'u1@test.com');
    await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: { vehicles: { upsert: [veh('v1', 1000)] }, maintenance_schedules: { upsert: [sched('s1', 'v1', 1000)] } },
    }, { dbPath });

    // Device A retunes the interval (config) at ts 2000.
    await runSync('u1', {
      deviceId: 'dA', since: 0,
      pushed: { maintenance_schedules: { upsert: [sched('s1', 'v1', 2000, { interval_km: 8000 })] } },
    }, { dbPath });

    // Device B, still holding the OLD interval, records a service (baseline) at ts 3000.
    // Before A4 this whole-row push rewrote interval_km back to 5000.
    const r = await runSync('u1', {
      deviceId: 'dB', since: 0,
      pushed: {
        maintenance_schedules: {
          upsert: [sched('s1', 'v1', 1500, {
            interval_km: 5000, last_done_odometer: 1200, last_done_date: '2026-10-30',
            baselineUpdatedAt: 3000,
          })],
        },
      },
    }, { dbPath });
    expect(r.rejected).toEqual([]);

    const row = await pullSchedule('u1', 's1');
    expect(row?.interval_km).toBe(8000);        // config untouched by B's stale copy
    expect(row?.last_done_odometer).toBe(1200); // baseline accepted from B
    expect(row?.last_done_date).toBe('2026-10-30');
  });

  it('keeps a newer baseline when a config edit arrives with a stale baseline copy', async () => {
    await seedUser('u1', 'u1@test.com');
    await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: { vehicles: { upsert: [veh('v1', 1000)] }, maintenance_schedules: { upsert: [sched('s1', 'v1', 1000)] } },
    }, { dbPath });

    // Baseline advanced at ts 3000 by the log link...
    await runSync('u1', {
      deviceId: 'dB', since: 0,
      pushed: {
        maintenance_schedules: {
          upsert: [sched('s1', 'v1', 1000, {
            last_done_odometer: 45000, last_done_date: '2026-10-05', baselineUpdatedAt: 3000,
          })],
        },
      },
    }, { dbPath });

    // ...then the owner edits the interval offline at ts 3500. Its own baseline
    // clock never moved (still 1000), so it must not carry 45000 back to null.
    await runSync('u1', {
      deviceId: 'dA', since: 0,
      pushed: {
        maintenance_schedules: {
          upsert: [sched('s1', 'v1', 3500, {
            interval_km: 10000, last_done_odometer: null, last_done_date: null, baselineUpdatedAt: 1000,
          })],
        },
      },
    }, { dbPath });

    const row = await pullSchedule('u1', 's1');
    expect(row?.interval_km).toBe(10000);
    expect(row?.last_done_odometer).toBe(45000); // the config push must not clear it
    expect(row?.last_done_date).toBe('2026-10-05');
  });

  it('drops a wholly stale push without reporting it as a refusal', async () => {
    await seedUser('u1', 'u1@test.com');
    await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: { vehicles: { upsert: [veh('v1', 1000)] }, maintenance_schedules: { upsert: [sched('s1', 'v1', 1000)] } },
    }, { dbPath });
    await runSync('u1', {
      deviceId: 'dB', since: 0,
      pushed: {
        maintenance_schedules: {
          upsert: [sched('s1', 'v1', 1000, { last_done_odometer: 900, baselineUpdatedAt: 5000 })],
        },
      },
    }, { dbPath });

    // A device that never saw either edit retries its ts-900 copy: no group is
    // newer, so the whole push is dropped — silently, exactly as row-level LWW
    // dropped a stale row before (it is not a refusal).
    const r = await runSync('u1', {
      deviceId: 'dC', since: 0,
      pushed: { maintenance_schedules: { upsert: [sched('s1', 'v1', 900, { interval_km: 1234, last_done_odometer: 1 })] } },
    }, { dbPath });
    expect(r.rejected).toEqual([]);
    expect(JSON.stringify(r.applied)).not.toContain('s1');

    const row = await pullSchedule('u1', 's1');
    expect(row?.interval_km).toBe(5000);
    expect(row?.last_done_odometer).toBe(900);
  });

  it('stamps both groups from a row-level push, so a pre-A4 client behaves as before', async () => {
    await seedUser('u1', 'u1@test.com');
    await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: { vehicles: { upsert: [veh('v1', 1000)] }, maintenance_schedules: { upsert: [sched('s1', 'v1', 1000)] } },
    }, { dbPath });

    // No `baselineUpdatedAt` at all: the baseline inherits the row stamp and the
    // edit lands exactly as row-level LWW used to apply it.
    await runSync('u1', {
      deviceId: 'dOld', since: 0,
      pushed: {
        maintenance_schedules: {
          upsert: [sched('s1', 'v1', 2000, { interval_km: 7500, last_done_odometer: 30000, last_done_date: '2026-09-01' })],
        },
      },
    }, { dbPath });

    const row = await pullSchedule('u1', 's1');
    expect(row?.interval_km).toBe(7500);
    expect(row?.last_done_odometer).toBe(30000);
    expect(Number(row?.updatedAt)).toBe(2000);
    expect(Number(row?.baselineUpdatedAt)).toBe(2000);
  });

  it('carries both stamps to a pulling device', async () => {
    await seedUser('u1', 'u1@test.com');
    await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: { vehicles: { upsert: [veh('v1', 1000)] }, maintenance_schedules: { upsert: [sched('s1', 'v1', 1000)] } },
    }, { dbPath });
    await runSync('u1', {
      deviceId: 'dB', since: 0,
      pushed: {
        maintenance_schedules: {
          upsert: [sched('s1', 'v1', 1000, { last_done_odometer: 500, baselineUpdatedAt: 4000 })],
        },
      },
    }, { dbPath });

    const p = await runSync('u1', { deviceId: 'dNew', since: 0 }, { dbPath });
    const row = p.pulled.maintenance_schedules?.upsert.find(s => s.id === 's1');
    expect(Number(row?.updatedAt)).toBe(1000);
    expect(Number(row?.baselineUpdatedAt)).toBe(4000);
  });

  it('judges a delete against the newest group stamp, not the config one', async () => {
    await seedUser('u1', 'u1@test.com');
    await runSync('u1', {
      deviceId: 'd1', since: 0,
      pushed: { vehicles: { upsert: [veh('v1', 1000)] }, maintenance_schedules: { upsert: [sched('s1', 'v1', 1000)] } },
    }, { dbPath });
    await runSync('u1', {
      deviceId: 'dB', since: 0,
      pushed: {
        maintenance_schedules: {
          upsert: [sched('s1', 'v1', 1000, { last_done_odometer: 800, baselineUpdatedAt: 5000 })],
        },
      },
    }, { dbPath });

    // A delete this device queued before it saw that baseline edit (config ts 1000,
    // delete stamped 3000) must not wipe a row whose newest stamp is 5000.
    await runSync('u1', { deviceId: 'dA', since: 0, pushed: { maintenance_schedules: { delete: [{ id: 's1', updatedAt: 3000 }] } } }, { dbPath });
    expect((await pullSchedule('u1', 's1'))?.last_done_odometer).toBe(800);

    // A delete after it does land, and propagates as a tombstone.
    await runSync('u1', { deviceId: 'dA', since: 0, pushed: { maintenance_schedules: { delete: [{ id: 's1', updatedAt: 6000 }] } } }, { dbPath });
    const p = await runSync('u1', { deviceId: 'dC', since: 0 }, { dbPath });
    expect(p.pulled.maintenance_schedules?.deleted).toContain('s1');
  });
});
