import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from '@nozbe/watermelondb';
import { makeDatabase } from '@device/database';
import { WMDBLocalStore } from '@device/localStore';
import { syncOnce } from '@sync/client';
import { createFetchBridge, type FetchHandler } from './fetchBridge';
import { makeMemorySettingsStore } from './settingsStore';
import { derivedItemsForServiceType } from '@app/services/presets';

// Node-env tests: Response/Request/URL/crypto.randomUUID are all global in Node 18+.
// The bridge is exercised directly (no window) with a deterministic clock.

const NOW = new Date('2024-06-01T12:00:00.000Z');

let db: Database;
let bridge: FetchHandler;

beforeEach(() => {
  db = makeDatabase();
  bridge = createFetchBridge({ db, settings: makeMemorySettingsStore(), now: () => NOW });
});

async function envelope(res: Response): Promise<any> {
  return res.json();
}

const vehiclePayload = {
  name: 'Offline Corolla', make: 'Toyota', model: 'Corolla', year: 2019,
  initialOdometer: 10000, currentOdometer: 10000, recommendedOil: '5W-30',
};

async function createVehicle(extra: Record<string, unknown> = {}): Promise<any> {
  const res = await bridge('/api/vehicles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...vehiclePayload, ...extra }),
  });
  const env = await envelope(res);
  expect(env.success).toBe(true);
  return env.data;
}

describe('offline fetch bridge: server-shaped envelopes', () => {
  it('GET /api/vehicles round-trips a POST as the exact server vehicle shape', async () => {
    const created = await createVehicle();

    // The create response and the list must both look like vehicleSchema output.
    expect(created).toMatchObject({
      name: 'Offline Corolla', make: 'Toyota', model: 'Corolla', year: 2019,
      engineCc: null, licensePlate: null, initialOdometer: 10000, currentOdometer: 10000,
      recommendedOil: '5W-30',
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.createdAt).toBe(NOW.toISOString());
    expect(created.updatedAt).toBe(NOW.toISOString());

    const listRes = await bridge('/api/vehicles');
    expect(listRes.status).toBe(200);
    const list = await envelope(listRes);
    expect(list.success).toBe(true);
    expect(Array.isArray(list.data)).toBe(true);
    expect(list.data).toHaveLength(1);
    expect(list.data[0].id).toBe(created.id);
  });

  it('rejects an invalid vehicle with a 400 error envelope (never a silent success)', async () => {
    const res = await bridge('/api/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', make: '', model: '', year: 2019, initialOdometer: 0, currentOdometer: 0 }),
    });
    expect(res.status).toBe(400);
    const env = await envelope(res);
    expect(env.success).toBe(false);
    expect(typeof env.error).toBe('string');
  });

  it('marks a created vehicle dirty and syncOnce pushes it through the transport', async () => {
    await createVehicle();

    const store = new WMDBLocalStore(db);
    const dirty = await store.collectDirty();
    expect(dirty.vehicles?.upsert).toHaveLength(1);
    expect(dirty.vehicles?.upsert?.[0]).toMatchObject({ name: 'Offline Corolla' });

    const calls: any[] = [];
    const fetchImpl = (async (_url: any, init: any) => {
      calls.push(JSON.parse(init.body));
      return {
        ok: true, status: 200,
        json: async () => ({ success: true, data: { serverSeq: 5, pulled: {} } }),
      };
    }) as typeof fetch;

    const outcome = await syncOnce(store, { baseUrl: 'https://srv.test', deviceId: 'dev-1', authToken: 'tok', fetchImpl });

    expect(calls).toHaveLength(1);
    expect(calls[0].pushed.vehicles.upsert[0].name).toBe('Offline Corolla');
    expect(calls[0].deviceId).toBe('dev-1');
    expect(outcome.pushedCount).toBe(1);
    expect(store.getSince()).toBe(5);
  });

  it('computes reports (summary + consumption) from local rows', async () => {
    const vehicle = await createVehicle();

    const fuel = [
      { fillDate: '2024-01-01', odometer: 10000, liters: 40, pricePerLiter: 20, totalCost: 800, isFullTank: true },
      { fillDate: '2024-01-10', odometer: 10400, liters: 30, pricePerLiter: 20, totalCost: 600, isFullTank: true },
    ];
    for (const log of fuel) {
      const res = await bridge('/api/fuel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...log, vehicleId: vehicle.id, notes: 'gasoline_92' }),
      });
      expect((await envelope(res)).success).toBe(true);
    }

    const res = await bridge(`/api/reports?vehicleId=${vehicle.id}`);
    expect(res.status).toBe(200);
    const env = await envelope(res);
    expect(env.success).toBe(true);

    expect(env.data.summary).toMatchObject({
      totalFuelCost: 1400,
      totalFuelLiters: 70,
      totalMaintenanceCost: 0,
      totalExpenses: 1400,
      fuelLogsCount: 2,
      maintenanceLogsCount: 0,
    });
    // Second full tank closes a 400 km / 30 L window -> 7.5 L/100km.
    expect(env.data.summary.averageLitersPer100Km).toBe(7.5);
    expect(env.data.vehicle.id).toBe(vehicle.id);
  });

  it('seeds default schedules idempotently on first schedules GET', async () => {
    const vehicle = await createVehicle();
    const first = await envelope(await bridge(`/api/schedules?vehicleId=${vehicle.id}`));
    expect(first.success).toBe(true);
    expect(first.data.schedules.length).toBeGreaterThan(0);
    const seededIds = first.data.schedules.map((s: any) => s.schedule.id);

    const second = await envelope(await bridge(`/api/schedules?vehicleId=${vehicle.id}`));
    // Idempotent: a second visit must not create a duplicate set.
    expect(second.data.schedules.map((s: any) => s.schedule.id).sort()).toEqual(seededIds.sort());
  });

  it('tombstones a fuel log on DELETE and drops it from the list', async () => {
    const vehicle = await createVehicle();
    const created = (await envelope(await bridge('/api/fuel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fillDate: '2024-02-01', odometer: 11000, liters: 30, pricePerLiter: 20, totalCost: 600, isFullTank: true, vehicleId: vehicle.id }),
    }))).data;

    const del = await bridge(`/api/fuel?id=${created.id}`, { method: 'DELETE' });
    const delEnv = await envelope(del);
    expect(delEnv.success).toBe(true);
    expect(delEnv.message).toBe('Deleted successfully');

    const list = await envelope(await bridge(`/api/fuel?vehicleId=${vehicle.id}`));
    expect(list.data).toHaveLength(0);
  });

  it('reads and writes settings locally (GET then POST reflects the change)', async () => {
    const before = await envelope(await bridge('/api/settings'));
    expect(before.success).toBe(true);
    expect(before.data.hasApiKey).toBe(false);
    expect(Array.isArray(before.data.fuelTypes)).toBe(true);

    const save = await bridge('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openrouter', apiKey: 'secret-key-1234', fuelTypes: [{ id: 'x', name: 'X', price: 1 }] }),
    });
    expect((await envelope(save)).success).toBe(true);

    const after = await envelope(await bridge('/api/settings'));
    expect(after.data.provider).toBe('openrouter');
    expect(after.data.hasApiKey).toBe(true);
    expect(after.data.maskedApiKey).toBe('secr...1234');
    expect(after.data.fuelTypes).toHaveLength(1);
  });

  it('answers an unimplemented /api endpoint with a structured 501 (never silent-empty)', async () => {
    const res = await bridge('/api/stats');
    expect(res.status).toBe(501);
    const env = await envelope(res);
    expect(env.success).toBe(false);
    expect(env.code).toBe('NOT_IMPLEMENTED');
    expect(typeof env.error).toBe('string');
  });

  it('serves the fuel-prices presets locally so the country picker works offline', async () => {
    const res = await bridge('/api/settings/fuel-prices');
    expect(res.status).toBe(200);
    const env = await envelope(res);
    expect(env.success).toBe(true);
    // Same payload as the server route, from the same geoPricing module.
    expect(env.data.current.countryCode).toBe('EG');
    expect(Array.isArray(env.data.supportedCountries)).toBe(true);
    expect(env.data.supportedCountries.length).toBeGreaterThan(1);

    const sa = await envelope(await bridge('/api/settings/fuel-prices?country=SA'));
    expect(sa.data.current.countryCode).toBe('SA');
    const tz = await envelope(await bridge('/api/settings/fuel-prices?tz=Asia/Riyadh'));
    expect(tz.data.current.countryCode).toBe('SA');
  });
});

describe('offline fetch bridge: network passthrough', () => {
  it('forwards auth & AI (and non-API paths) to the server, everything else locally', async () => {
    const forwarded: string[] = [];
    const passthroughFetch = (async (input: any) => {
      forwarded.push(String(typeof input === 'string' ? input : input.url));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const remote = createFetchBridge({
      db: makeDatabase(),
      settings: makeMemorySettingsStore(),
      serverBaseUrl: 'https://srv.test',
      passthroughFetch,
      now: () => NOW,
    });

    await remote('/api/auth/me');
    await remote('/api/ai/manual', { method: 'POST', body: '{}' });
    await remote('/api/app-version');
    await remote('/icons/icon.svg');

    expect(forwarded).toEqual([
      'https://srv.test/api/auth/me',
      'https://srv.test/api/ai/manual',
      'https://srv.test/api/app-version',
      '/icons/icon.svg',
    ]);

    // A locally-served endpoint must NOT be forwarded.
    const res = await remote('/api/vehicles');
    expect((await envelope(res)).success).toBe(true);
    expect(forwarded.every((u) => !u.includes('/api/vehicles'))).toBe(true);
  });
});

describe('offline fetch bridge: needs-connection state for auth/AI', () => {
  function offlineBridge(passthroughFetch: typeof fetch, isOnline: () => boolean): FetchHandler {
    return createFetchBridge({
      db: makeDatabase(),
      settings: makeMemorySettingsStore(),
      serverBaseUrl: 'https://srv.test',
      passthroughFetch,
      isOnline,
      now: () => NOW,
    });
  }

  it('answers AI and session GETs with a structured 503 while offline, without touching the network', async () => {
    const used: string[] = [];
    const remote = offlineBridge((async (input: any) => {
      used.push(String(input));
      return new Response('{}', { status: 200 });
    }) as typeof fetch, () => false);

    for (const [url, init] of [
      ['/api/ai/doctor', { method: 'POST', body: '{}' }],
      ['/api/ai/manual', { method: 'POST', body: '{}' }],
      ['/api/ai/lookup', { method: 'POST', body: '{}' }],
      ['/api/app-version', undefined],
      ['/api/auth/me', undefined],
    ] as Array<[string, RequestInit | undefined]>) {
      const res = await remote(url, init);
      expect(res.status).toBe(503);
      const env = await envelope(res);
      expect(env.success).toBe(false);
      expect(env.code).toBe('NETWORK_REQUIRED');
      // readEnvelope()/page.tsx surfaces `error` straight into the UI.
      expect(env.error).toContain('No connection');
    }
    expect(used).toEqual([]);

    // Offline must not disable the local half of the app.
    expect((await envelope(await remote('/api/vehicles'))).success).toBe(true);
    expect((await envelope(await remote('/api/reports?vehicleId=nope'))).data).toBeUndefined();
  });

  it('converts a transport failure for an AI call into the same 503 envelope', async () => {
    const remote = offlineBridge((async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch, () => true);

    const res = await remote('/api/ai/doctor', { method: 'POST', body: '{}' });
    expect(res.status).toBe(503);
    const env = await envelope(res);
    expect(env.code).toBe('NETWORK_REQUIRED');
    expect(env.error).toContain('Failed to fetch');
  });

  it('still forwards normally when the probe reports connectivity', async () => {
    const used: string[] = [];
    const remote = offlineBridge((async (input: any) => {
      used.push(String(input));
      return new Response(JSON.stringify({ success: true, data: { advice: 'check the dealer' } }), { status: 200 });
    }) as typeof fetch, () => true);

    const env = await envelope(await remote('/api/ai/doctor', { method: 'POST', body: '{}' }));
    expect(used).toEqual(['https://srv.test/api/ai/doctor']);
    expect(env.success).toBe(true);
    expect(env.data.advice).toContain('dealer');
  });
});

// A4 on the offline side: the two UI paths that write a schedule must move
// DIFFERENT clocks — the item editor the config clock, the log→item link the
// baseline clock. Attribution here is what lets the server merge the row per
// group instead of letting one writer erase the other.
describe('offline fetch bridge: schedule group stamps follow the writer', () => {
  let clockMs = Date.parse('2024-06-01T12:00:00.000Z');
  let bdb: Database;
  let bbridge: FetchHandler;

  beforeEach(() => {
    clockMs = Date.parse('2024-06-01T12:00:00.000Z');
    bdb = makeDatabase();
    bbridge = createFetchBridge({ db: bdb, settings: makeMemorySettingsStore(), now: () => new Date(clockMs) });
  });

  const post = (path: string, body: any) =>
    bbridge(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  // The factory item an `oil_change` log evidences, so the two writers below are
  // proven to fight over the same row.
  const OIL_ITEM = derivedItemsForServiceType('oil_change')[0];

  async function scheduleRaw(vehicleId: string, itemCode: string): Promise<any> {
    const rows = await bdb.collections.get('maintenance_schedules').query();
    const hit = (rows as any[]).find(r => r._raw.vehicle_id === vehicleId && r._raw.item_code === itemCode);
    expect(hit, `seeded item ${itemCode}`).toBeTruthy();
    return hit._raw;
  }

  it('an interval edit and a linked service each stamp only their own group', async () => {
    const vehicle = (await envelope(await post('/api/vehicles', vehiclePayload))).data;
    await envelope(await bbridge(`/api/schedules?vehicleId=${vehicle.id}`));

    const seeded = await scheduleRaw(vehicle.id, OIL_ITEM);
    expect(seeded.updated_at_sync_config).toBe(clockMs);
    expect(seeded.updated_at_sync_baseline).toBe(clockMs);
    const seededAt = clockMs;

    // Owner retunes the interval in the items editor.
    clockMs += 1000;
    const patch = await envelope(await bbridge('/api/schedules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: seeded.id, intervalKm: 9000 }),
    }));
    expect(patch.success).toBe(true);
    let raw = await scheduleRaw(vehicle.id, OIL_ITEM);
    expect(raw.interval_km).toBe(9000);
    expect(raw.updated_at_sync_config).toBe(seededAt + 1000);
    expect(raw.updated_at_sync_baseline).toBe(seededAt);

    // A recorded oil change links onto the same row afterwards.
    clockMs += 2000;
    const logged = await envelope(await post('/api/maintenance', {
      vehicleId: vehicle.id, serviceDate: '2024-06-01', odometer: 20000,
      serviceType: 'oil_change', title: 'Oil change', partsCost: 50, laborCost: 50, totalCost: 100,
    }));
    expect(logged.success).toBe(true);
    expect(logged.data.linkedSchedules).toBeGreaterThan(0);

    raw = await scheduleRaw(vehicle.id, OIL_ITEM);
    expect(raw.last_done_odometer).toBe(20000);
    expect(raw.updated_at_sync_baseline).toBe(seededAt + 3000);
    expect(raw.updated_at_sync_config).toBe(seededAt + 1000); // the link did not claim the config

    // And the outbox says so on the wire, which is what the server merges from.
    const pushed = await new WMDBLocalStore(bdb).collectDirty();
    const row = pushed.maintenance_schedules?.upsert?.find((r: any) => r.id === seeded.id);
    expect(row).toMatchObject({
      interval_km: 9000, last_done_odometer: 20000,
      updatedAt: seededAt + 1000, baselineUpdatedAt: seededAt + 3000,
    });
  });

  it('leaves the vehicle odometer write on a single row-level clock', async () => {
    const vehicle = (await envelope(await post('/api/vehicles', vehiclePayload))).data;
    await envelope(await bbridge(`/api/schedules?vehicleId=${vehicle.id}`));

    await post('/api/maintenance', {
      vehicleId: vehicle.id, serviceDate: '2024-06-01', odometer: 20000,
      serviceType: 'oil_change', title: 'Oil change', partsCost: 0, laborCost: 50, totalCost: 50,
    });

    const vehRaw = (await bdb.collections.get('vehicles').find(vehicle.id) as any)._raw;
    expect(vehRaw.current_odometer).toBe(20000);
    expect(vehRaw.updated_at_sync_config).toBeUndefined();
    expect(vehRaw.updated_at_sync_baseline).toBeUndefined();
  });
});
