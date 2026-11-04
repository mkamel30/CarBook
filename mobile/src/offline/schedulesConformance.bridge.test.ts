import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from '@nozbe/watermelondb';
import { makeDatabase } from '@device/database';
import { createFetchBridge, type FetchHandler } from './fetchBridge';
import { makeMemorySettingsStore } from './settingsStore';
import { describeSchedulesConformance, type ConformanceVehicle, type SchedulesAdapter } from '@app/domain/schedulesConformance';

// The DEVICE half of the schedules conformance suite (@app/domain/schedulesConformance).
// The same scenarios the server routes are held to run here against the offline
// bridge over WatermelonDB, so the two storage ports of the shared domain core
// cannot answer differently — the phone must not resurrect an item the owner
// removed, rewind a baseline, or disagree about the odometer.

const NOW = new Date('2024-06-01T12:00:00.000Z');

let db: Database;
let bridge: FetchHandler;

async function env(res: Response): Promise<any> {
  const json = await res.json();
  if (!json.success) throw new Error(`${res.status} ${JSON.stringify(json)}`);
  return json;
}

function call(urlPath: string, init?: RequestInit) {
  return bridge(urlPath, init);
}

function post(urlPath: string, body: unknown) {
  return call(urlPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function put(urlPath: string, body: unknown) {
  return call(urlPath, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

const bridgeAdapter: SchedulesAdapter = {
  name: 'offline bridge + WatermelonDB',

  async createVehicle(input) {
    const res = await env(await post('/api/vehicles', input));
    return res.data as ConformanceVehicle;
  },

  async readVehicle(id) {
    const res = await env(await call(`/api/schedules?vehicleId=${id}`));
    return (res.data.vehicle ?? null) as ConformanceVehicle | null;
  },

  async listSchedules(vehicleId) {
    const res = await env(await call(`/api/schedules?vehicleId=${vehicleId}`));
    return res.data;
  },

  async removeSchedule(id) {
    await env(await call(`/api/schedules?id=${id}`, { method: 'DELETE' }));
  },

  async addMaintenance(input) {
    const res = await env(await post('/api/maintenance', input));
    return { id: res.data.id, linkedSchedules: res.data.linkedSchedules };
  },

  async updateMaintenance(input) {
    const res = await env(await put('/api/maintenance', input));
    return { linkedSchedules: res.data.linkedSchedules };
  },

  async deleteMaintenance(id) {
    await env(await call(`/api/maintenance?id=${id}`, { method: 'DELETE' }));
  },

  async addFuel(input) {
    const res = await env(await post('/api/fuel', input));
    return { id: res.data.id };
  },

  async deleteFuel(id) {
    await env(await call(`/api/fuel?id=${id}`, { method: 'DELETE' }));
  },
};

beforeEach(() => {
  db = makeDatabase();
  bridge = createFetchBridge({ db, settings: makeMemorySettingsStore(), now: () => NOW });
});

describeSchedulesConformance(bridgeAdapter);

describe('schedules conformance harness — device', () => {
  it('answers a schedules read for an unknown vehicle like the server does', async () => {
    const res = await call(`/api/schedules?vehicleId=missing-car`);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});
