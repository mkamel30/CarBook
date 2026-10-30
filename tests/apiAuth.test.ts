import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { StorageRepository } from '@/persistence/repository';
import { signSessionToken, signAccessToken } from '@/services/auth';

// The routes build a default StorageRepository, which resolves the file at
// construction time, so the env var has to be set before the first handler runs.
const dbPath = path.resolve(
  process.cwd(),
  `test_api_auth_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
);
process.env.CARBOOK_DB_PATH = dbPath;

import { POST as postFuel, PUT as putFuel, DELETE as deleteFuel, GET as getFuel } from '@/app/api/fuel/route';
import { POST as postMaint, PUT as putMaint, DELETE as deleteMaint } from '@/app/api/maintenance/route';
import { PATCH as patchSchedule } from '@/app/api/schedules/route';
import { POST as postSettings, GET as getSettings } from '@/app/api/settings/route';
import { POST as postVehicle, GET as getVehicles } from '@/app/api/vehicles/route';
import { POST as aiLookup } from '@/app/api/ai/lookup/route';

const A = { id: 'user-a', email: 'a@example.com', name: 'A', picture: null };
const B = { id: 'user-b', email: 'b@example.com', name: 'B', picture: null };

function bearer(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}
function cookie(token: string) {
  return { 'Content-Type': 'application/json', Cookie: `carbook_session=${token}` };
}

function makeReq(url: string, init: any = {}): NextRequest {
  return new NextRequest(`http://localhost:3070${url}`, init);
}

let repo: StorageRepository;
let tokenA: string;
let tokenB: string;
let vehicleA: string;
let vehicleB: string;

async function seedFuelLog(vehicleId: string, odometer: number) {
  return repo.addFuelLog({
    vehicleId,
    fillDate: '2026-10-01',
    odometer,
    liters: 30,
    pricePerLiter: 15,
    totalCost: 450,
    isFullTank: true,
  });
}

async function seedMaintenanceLog(vehicleId: string, odometer: number) {
  return repo.addMaintenanceLog({
    vehicleId,
    serviceDate: '2026-10-02',
    odometer,
    serviceType: 'oil_change',
    title: 'زيت',
    partsCost: 0,
    laborCost: 0,
    totalCost: 100,
  });
}

async function countFuel(vehicleId: string) {
  return (await repo.getFuelLogsByVehicle(vehicleId)).length;
}

beforeAll(async () => {
  repo = new StorageRepository();
  // The tenants have to exist first: vehicles.user_id is a foreign key.
  await repo.findOrCreateUser({ id: A.id, email: A.email, name: A.name });
  await repo.findOrCreateUser({ id: B.id, email: B.email, name: B.name });
  vehicleA = (await repo.createVehicle({
    name: 'A Car', make: 'Toyota', model: 'Corolla', year: 2022,
    initialOdometer: 1000, currentOdometer: 1000,
  }, A.id)).id!;
  vehicleB = (await repo.createVehicle({
    name: 'B Car', make: 'Nissan', model: 'Sunny', year: 2020,
    initialOdometer: 2000, currentOdometer: 2000,
  }, B.id)).id!;
  tokenA = signAccessToken(A);
  tokenB = signAccessToken(B);
});

afterAll(async () => {
  await repo.close();
  if (fs.existsSync(dbPath)) {
    try { fs.unlinkSync(dbPath); } catch {}
  }
});

describe('API route authorization', () => {
  it('rejects anonymous writes on every mutating route', async () => {
    const cases: Array<() => Promise<Response>> = [
      () => postFuel(makeReq('/api/fuel', { method: 'POST', body: JSON.stringify({ vehicleId: vehicleB }) })),
      () => putFuel(makeReq('/api/fuel', { method: 'PUT', body: JSON.stringify({ id: 'x' }) })),
      () => deleteFuel(makeReq('/api/fuel?id=x', { method: 'DELETE' })),
      () => postMaint(makeReq('/api/maintenance', { method: 'POST', body: JSON.stringify({ vehicleId: vehicleB }) })),
      () => putMaint(makeReq('/api/maintenance', { method: 'PUT', body: JSON.stringify({ id: 'x' }) })),
      () => deleteMaint(makeReq('/api/maintenance?id=x', { method: 'DELETE' })),
      () => patchSchedule(makeReq('/api/schedules', { method: 'PATCH', body: JSON.stringify({ id: 'x', intervalKm: 1 }) })),
      () => postSettings(makeReq('/api/settings', { method: 'POST', body: JSON.stringify({ apiKey: 'attacker-key' }) })),
      () => postVehicle(makeReq('/api/vehicles', { method: 'POST', body: JSON.stringify({
        name: 'Ghost', make: 'Toyota', model: 'Corolla', year: 2022,
        initialOdometer: 0, currentOdometer: 0,
      }) })),
      () => aiLookup(makeReq('/api/ai/lookup', { method: 'POST', body: JSON.stringify({ make: 'Toyota', model: 'Corolla', year: 2022 }) })),
      () => getFuel(makeReq('/api/fuel?vehicleId=' + vehicleB)),
      () => getSettings(makeReq('/api/settings')),
    ];

    for (const call of cases) {
      const res = await call();
      expect(res.status).toBe(401);
    }

    // The anonymous settings write must not have landed.
    expect(await repo.getSetting('ai_api_key')).toBeNull();
    // The anonymous vehicle write must not have created an orphan row.
    expect(await repo.getAllVehicles(A.id)).toHaveLength(1);
  });

  it('hides every tenant record from another tenant on fuel writes', async () => {
    const log = await seedFuelLog(vehicleB, 2100);

    const create = await postFuel(makeReq('/api/fuel', {
      method: 'POST',
      headers: bearer(tokenA),
      body: JSON.stringify({
        vehicleId: vehicleB, fillDate: '2026-10-05', odometer: 9999,
        liters: 10, pricePerLiter: 10, totalCost: 100, isFullTank: true,
      }),
    }));
    expect(create.status).toBe(404);
    expect(await countFuel(vehicleB)).toBe(1);

    const edit = await putFuel(makeReq('/api/fuel', {
      method: 'PUT',
      headers: bearer(tokenA),
      body: JSON.stringify({ id: log.id, liters: 999 }),
    }));
    expect(edit.status).toBe(404);
    const afterEdit = await repo.getFuelLogsByVehicle(vehicleB);
    expect(afterEdit[0].liters).toBe(30);

    const remove = await deleteFuel(makeReq(`/api/fuel?id=${log.id}`, {
      method: 'DELETE',
      headers: bearer(tokenA),
    }));
    expect(remove.status).toBe(404);
    expect(await countFuel(vehicleB)).toBe(1);

    const read = await getFuel(makeReq(`/api/fuel?vehicleId=${vehicleB}`, { headers: bearer(tokenA) }));
    expect(read.status).toBe(404);
  });

  it('lets the real owner write, read and delete their own fuel log', async () => {
    const created = await postFuel(makeReq('/api/fuel', {
      method: 'POST',
      headers: bearer(tokenB),
      body: JSON.stringify({
        vehicleId: vehicleB, fillDate: '2026-10-06', odometer: 2300,
        liters: 40, pricePerLiter: 15, totalCost: 600, isFullTank: true,
      }),
    }));
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body.success).toBe(true);

    const read = await getFuel(makeReq(`/api/fuel?vehicleId=${vehicleB}`, { headers: bearer(tokenB) }));
    expect(read.status).toBe(200);
    const list = (await read.json()).data;
    expect(list.some((l: any) => l.id === body.data.id)).toBe(true);

    const removed = await deleteFuel(makeReq(`/api/fuel?id=${body.data.id}`, { method: 'DELETE', headers: bearer(tokenB) }));
    expect(removed.status).toBe(200);
  });

  it('rejects cross-tenant writes to maintenance logs and schedules', async () => {
    const mlog = await seedMaintenanceLog(vehicleB, 2500);
    const sched = await repo.addMaintenanceSchedule({
      vehicleId: vehicleB, itemCode: 'engine_oil', titleAr: 'زيت', titleEn: 'Oil',
      intervalKm: 10000, lastDoneOdometer: 2000, lastDoneDate: '2026-01-01',
    });

    const create = await postMaint(makeReq('/api/maintenance', {
      method: 'POST',
      headers: bearer(tokenA),
      body: JSON.stringify({
        vehicleId: vehicleB, serviceDate: '2026-10-07', odometer: 1, serviceType: 'repair',
        title: 'hijack', partsCost: 0, laborCost: 0, totalCost: 1,
      }),
    }));
    expect(create.status).toBe(404);
    expect((await repo.getMaintenanceLogsByVehicle(vehicleB)).length).toBe(1);

    const edit = await putMaint(makeReq('/api/maintenance', {
      method: 'PUT', headers: bearer(tokenA), body: JSON.stringify({ id: mlog.id, title: 'hijack' }),
    }));
    expect(edit.status).toBe(404);
    expect((await repo.getMaintenanceLogsByVehicle(vehicleB))[0].title).toBe('زيت');

    const remove = await deleteMaint(makeReq(`/api/maintenance?id=${mlog.id}`, { method: 'DELETE', headers: bearer(tokenA) }));
    expect(remove.status).toBe(404);
    expect((await repo.getMaintenanceLogsByVehicle(vehicleB)).length).toBe(1);

    const patch = await patchSchedule(makeReq('/api/schedules', {
      method: 'PATCH', headers: bearer(tokenA), body: JSON.stringify({ id: sched.id, intervalKm: 1 }),
    }));
    expect(patch.status).toBe(404);
    expect((await repo.getSchedulesByVehicle(vehicleB))[0].intervalKm).toBe(10000);
  });

  it('accepts the owner editing their own schedule and settings', async () => {
    const patch = await patchSchedule(makeReq('/api/schedules', {
      method: 'PATCH', headers: bearer(tokenB), body: JSON.stringify({ id: (await repo.getSchedulesByVehicle(vehicleB))[0].id, intervalKm: 7777 }),
    }));
    expect(patch.status).toBe(200);
    expect((await repo.getSchedulesByVehicle(vehicleB))[0].intervalKm).toBe(7777);

    const saved = await postSettings(makeReq('/api/settings', {
      method: 'POST', headers: bearer(tokenB), body: JSON.stringify({ provider: 'openrouter' }),
    }));
    expect(saved.status).toBe(200);
    expect(await repo.getSetting('ai_provider')).toBe('openrouter');
  });

  it('authenticates a session cookie the same way as a bearer token', async () => {
    const longLived = signSessionToken(A);
    const res = await getFuel(makeReq(`/api/fuel?vehicleId=${vehicleA}`, { headers: cookie(longLived) }));
    expect(res.status).toBe(200);

    const forged = await getFuel(makeReq(`/api/fuel?vehicleId=${vehicleA}`, { headers: cookie('not.a.jwt') }));
    expect(forged.status).toBe(401);
  });

  it('reports an unknown record id the same as a foreign one, so ids are not enumerable', async () => {
    const missing = await deleteFuel(makeReq('/api/fuel?id=00000000-0000-4000-8000-000000000000', {
      method: 'DELETE', headers: bearer(tokenA),
    }));
    expect(missing.status).toBe(404);

    const foreign = await deleteFuel(makeReq(`/api/fuel?id=${(await repo.getFuelLogsByVehicle(vehicleB))[0].id}`, {
      method: 'DELETE', headers: bearer(tokenA),
    }));
    expect(foreign.status).toBe(404);
  });

  it('returns an empty vehicle list rather than unassigned legacy rows to anonymous callers', async () => {
    const orphan = await repo.createVehicle({
      name: 'Legacy', make: 'Toyota', model: 'Corolla', year: 2020,
      initialOdometer: 0, currentOdometer: 0,
    });

    const res = await getVehicles(makeReq('/api/vehicles'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);

    // ...and the orphan is reachable by nobody, not treated as public.
    const probe = await getFuel(makeReq(`/api/fuel?vehicleId=${orphan.id}`, { headers: bearer(tokenA) }));
    expect(probe.status).toBe(404);
  });
});
