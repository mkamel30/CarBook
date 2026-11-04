import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

// The SERVER half of the schedules conformance suite (domain/schedulesConformance.ts).
// Every scenario runs through the real route handlers against a real libsql file in
// the OS temp dir — the same code path the deployed server takes, so the shared
// domain core is proven against the actual storage port, not a mock.
//
// The routes build a default StorageRepository, which resolves CARBOOK_DB_PATH at
// first use, so the env vars must be set before the handler imports below run.
const dbPath = path.join(os.tmpdir(), `carbook_schedconf_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
process.env.CARBOOK_DB_PATH = dbPath;
process.env.JWT_SECRET = 'schedules_conformance_secret_pad';
process.env.APP_ORIGIN = 'http://localhost:3080';

import { getDatabase } from '@/persistence/db';
import { StorageRepository } from '@/persistence/repository';
import { signSessionToken } from '@/services/auth';
import { computeMaxOdometer } from '@/domain/schedulesCore';
import { POST as vehiclePost } from '@/app/api/vehicles/route';
import { GET as schedulesGet, DELETE as scheduleDelete } from '@/app/api/schedules/route';
import { POST as maintPost, PUT as maintPut, DELETE as maintDelete } from '@/app/api/maintenance/route';
import { POST as fuelPost, DELETE as fuelDelete } from '@/app/api/fuel/route';
import { describeSchedulesConformance, type ConformanceVehicle, type SchedulesAdapter } from '@/domain/schedulesConformance';

const USER = { id: 'sched_conf_user', email: 'sched-conf@example.com', name: 'Sched Conf', picture: null };
const ORIGIN = 'http://localhost:3080';

let token: string;
let repo: StorageRepository;

async function env(res: Promise<Response>): Promise<any> {
  const response = await res;
  const json = await response.json();
  if (!json.success) throw new Error(`${response.status} ${JSON.stringify(json)}`);
  return json;
}

function getReq(urlPath: string): NextRequest {
  return new NextRequest(`${ORIGIN}${urlPath}`, { headers: { Authorization: `Bearer ${token}` } });
}

function bodyReq(urlPath: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`${ORIGIN}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function delReq(urlPath: string): NextRequest {
  return new NextRequest(`${ORIGIN}${urlPath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

const serverAdapter: SchedulesAdapter = {
  name: 'server routes + libsql',

  async createVehicle(input) {
    const res = await env(vehiclePost(bodyReq('/api/vehicles', 'POST', input)));
    return res.data as ConformanceVehicle;
  },

  // /api/schedules carries the vehicle alongside the items, so one read covers both.
  async readVehicle(id) {
    const res = await env(schedulesGet(getReq(`/api/schedules?vehicleId=${id}`)));
    return (res.data.vehicle ?? null) as ConformanceVehicle | null;
  },

  async listSchedules(vehicleId) {
    const res = await env(schedulesGet(getReq(`/api/schedules?vehicleId=${vehicleId}`)));
    return res.data;
  },

  async removeSchedule(id) {
    await env(scheduleDelete(delReq(`/api/schedules?id=${id}`)));
  },

  async addMaintenance(input) {
    const res = await env(maintPost(bodyReq('/api/maintenance', 'POST', input)));
    return { id: res.data.id, linkedSchedules: res.data.linkedSchedules };
  },

  async updateMaintenance(input) {
    const res = await env(maintPut(bodyReq('/api/maintenance', 'PUT', input)));
    return { linkedSchedules: res.data.linkedSchedules };
  },

  async deleteMaintenance(id) {
    await env(maintDelete(delReq(`/api/maintenance?id=${id}`)));
  },

  async addFuel(input) {
    const res = await env(fuelPost(bodyReq('/api/fuel', 'POST', input)));
    return { id: res.data.id };
  },

  async deleteFuel(id) {
    await env(fuelDelete(delReq(`/api/fuel?id=${id}`)));
  },
};

beforeAll(async () => {
  await getDatabase();
  repo = new StorageRepository();
  await repo.findOrCreateUser({ id: USER.id, email: USER.email, name: USER.name });
  token = signSessionToken(USER);
});

afterAll(async () => {
  try { await repo.close(); } catch { /* ignore */ }
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

describeSchedulesConformance(serverAdapter);

describe('schedules conformance harness', () => {
  it('runs against a temp DB outside the repo working tree', () => {
    expect(dbPath.startsWith(fs.realpathSync(os.tmpdir()))).toBe(true);
  });

  it('rejects a schedules read with no bearer session (auth stays enforced)', async () => {
    const unauth = await schedulesGet(new NextRequest(`${ORIGIN}/api/schedules?vehicleId=whatever`));
    expect(unauth.status).toBe(401);
  });

  // The server encodes the odometer rule as SQL inside the write transaction and
  // the device encodes it with computeMaxOdometer. This pins the two encodings to
  // the same answer on real rows, so neither side can drift unnoticed.
  it('stores exactly what the shared odometer rule computes', async () => {
    const vehicle = await serverAdapter.createVehicle({
      name: 'SQL Agreement', make: 'Toyota', model: 'Corolla', year: 2020,
      initialOdometer: 5000, currentOdometer: 5000,
    });
    const fill = await serverAdapter.addFuel({
      vehicleId: vehicle.id, fillDate: '2026-03-01', odometer: 24000,
      liters: 30, pricePerLiter: 11, totalCost: 330, isFullTank: true,
    });
    await serverAdapter.addMaintenance({
      vehicleId: vehicle.id, serviceDate: '2026-04-01', odometer: 22500,
      serviceType: 'periodic', title: 'Periodic', totalCost: 700,
    });

    const expected = async () => computeMaxOdometer(
      vehicle.initialOdometer,
      [
        ...(await repo.getFuelLogsByVehicle(vehicle.id)).map((f) => f.odometer),
        ...(await repo.getMaintenanceLogsByVehicle(vehicle.id)).map((m) => m.odometer),
      ],
    );
    const stored = async () => (await repo.getVehicleById(vehicle.id, USER.id))?.currentOdometer;

    expect(await stored()).toBe(await expected());
    expect(await stored()).toBe(24000);

    await serverAdapter.deleteFuel(fill.id);
    expect(await stored()).toBe(await expected());
  });
});
