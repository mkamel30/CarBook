import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

// T9 route-level coverage: import the ACTUAL handlers and drive them the way
// the client does. The routes construct a default StorageRepository, which
// resolves the DB file at first use from CARBOOK_DB_PATH, so the env vars must
// be set before the handler imports below run. OS tmpdir DB: the repo root is
// never written.
const dbPath = path.join(os.tmpdir(), `carbook_routecov_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
process.env.CARBOOK_DB_PATH = dbPath;
process.env.JWT_SECRET = 'route_coverage_secret_key_pad';
process.env.APP_ORIGIN = 'http://localhost:3070';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

import { getDatabase } from '@/persistence/db';
import { StorageRepository } from '@/persistence/repository';
import { OAUTH_NONCE_COOKIE, signAccessToken, signSessionToken } from '@/services/auth';
import { POST as syncPost } from '@/app/api/sync/route';
import { GET as backupGet } from '@/app/api/backup/route';
import { GET as reportsGet } from '@/app/api/reports/route';
import { GET as fuelPricesGet } from '@/app/api/settings/fuel-prices/route';
import { POST as fuelPost, DELETE as fuelDelete } from '@/app/api/fuel/route';
import { GET as googleCallback } from '@/app/api/auth/callback/google/route';

const SYNC_USER = { id: 'rc_sync_user', email: 'rc-sync@example.com', name: 'RC Sync', picture: null };
const BACKUP_USER = { id: 'rc_backup_user', email: 'rc-backup@example.com', name: 'RC Backup', picture: null };
const REPORTS_USER = { id: 'rc_reports_user', email: 'rc-reports@example.com', name: 'RC Reports', picture: null };
const PRICES_USER = { id: 'rc_prices_user', email: 'rc-prices@example.com', name: 'RC Prices', picture: null };

// Vehicle ids are UUIDs: the sync push itself accepts any client string id, but
// the /api/fuel REST write re-validates vehicleId through fuelLogSchema (uuid).
const V1 = crypto.randomUUID();
const V2 = crypto.randomUUID();
const V3 = crypto.randomUUID();

function makeReq(urlPath: string, init: any = {}): NextRequest {
  return new NextRequest(`http://localhost:3070${urlPath}`, init);
}
function bearer(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

let repo: StorageRepository;

beforeAll(async () => {
  repo = new StorageRepository();
  for (const u of [SYNC_USER, BACKUP_USER, REPORTS_USER, PRICES_USER]) {
    await repo.findOrCreateUser({ id: u.id, email: u.email, name: u.name });
  }
});

afterAll(async () => {
  try { await repo.close(); } catch { /* ignore */ }
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

/** Fake the two outbound Google calls the callback makes (token + userinfo). */
function stubGoogleFetch(sub: string) {
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com/token')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({ access_token: 'ya29.fake' }) };
    }
    if (u.includes('googleapis.com/oauth2/v3/userinfo')) {
      return { ok: true, status: 200, json: async () => ({ sub, email: `${sub}@example.com`, name: 'RC User', picture: null }) };
    }
    throw new Error(`unexpected fetch: ${u}`);
  }));
}

// ---------------------------------------------------------------------------
// /api/sync POST
// ---------------------------------------------------------------------------
describe('/api/sync POST — route-level contract', { timeout: 30_000 }, () => {
  it('requires authentication', async () => {
    const res = await syncPost(makeReq('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'd0', since: 0 }),
    }));
    expect(res.status).toBe(401);

    const noDevice = await syncPost(makeReq('/api/sync', {
      method: 'POST',
      headers: bearer(signAccessToken(SYNC_USER)),
      body: JSON.stringify({ since: 0 }),
    }));
    expect(noDevice.status).toBe(400);
  });

  it('applies a valid push and pulls changes back in global seq order, including a delete tombstone after /api/fuel DELETE', async () => {
    const token = bearer(signAccessToken(SYNC_USER));

    // Push three vehicles in one call: the accepted order fixes the seq order,
    // and pull must hand them back exactly in that global order.
    const iso = new Date().toISOString();
    const veh = (id: string, name: string) => ({
      id, name, make: 'Toyota', model: 'Corolla', year: 2020,
      license_plate: null, initial_odometer: 0, current_odometer: 100,
      recommended_oil: null, specs: null, created_at: iso, updated_at: iso,
      updatedAt: Date.now(),
    });
    const pushRes = await syncPost(makeReq('/api/sync', {
      method: 'POST', headers: token,
      body: JSON.stringify({
        deviceId: 'devRoute1', since: 0,
        pushed: { vehicles: { upsert: [veh(V1, 'First'), veh(V3, 'Third'), veh(V2, 'Second')] } },
      }),
    }));
    expect(pushRes.status).toBe(200);
    const pushBody = await pushRes.json();
    expect(pushBody.success).toBe(true);
    expect(pushBody.data.rejected).toEqual([]);
    expect(pushBody.data.applied.map((a: any) => a.id)).toEqual([V1, V3, V2]);

    const pullRes = await syncPost(makeReq('/api/sync', {
      method: 'POST', headers: token,
      body: JSON.stringify({ deviceId: 'devRoute2', since: 0 }),
    }));
    const pullBody = await pullRes.json();
    const ids = pullBody.data.pulled.vehicles.upsert.map((v: any) => v.id);
    expect(ids).toEqual([V1, V3, V2]);

    // Create a fuel log through the REST (repository) path, settle a device...
    const created = await fuelPost(makeReq('/api/fuel', {
      method: 'POST', headers: token,
      body: JSON.stringify({
        vehicleId: V1, fillDate: '2026-04-01', odometer: 200, liters: 30,
        pricePerLiter: 10, totalCost: 300, isFullTank: true,
      }),
    }));
    expect(created.status).toBe(200);
    const logId = (await created.json()).data.id;

    const settled = await syncPost(makeReq('/api/sync', {
      method: 'POST', headers: token,
      body: JSON.stringify({ deviceId: 'devRoute3', since: 0 }),
    }));
    const settledBody = await settled.json();
    expect(settledBody.data.pulled.fuel_logs.upsert.find((f: any) => f.id === logId)).toBeTruthy();

    // ...then DELETE it through the real /api/fuel route: another device's pull
    // must receive the tombstone, not silence (server tombstone authority).
    const del = await fuelDelete(makeReq(`/api/fuel?id=${logId}`, { method: 'DELETE', headers: token }));
    expect(del.status).toBe(200);

    const afterDelete = await syncPost(makeReq('/api/sync', {
      method: 'POST', headers: token,
      body: JSON.stringify({ deviceId: 'devRoute4', since: 0 }),
    }));
    const afterBody = await afterDelete.json();
    expect(afterBody.data.pulled.fuel_logs.deleted).toContain(logId);
    expect(afterBody.data.pulled.fuel_logs.upsert.find((f: any) => f.id === logId)).toBeUndefined();
  });

  it('rejects an invalid row per-row while valid siblings apply (NEW push contract)', async () => {
    const token = bearer(signAccessToken(SYNC_USER));
    const ts = Date.now();
    const fuel = (id: string, over: Record<string, any> = {}) => ({
      id, vehicle_id: V1, fill_date: '2026-04-02', odometer: 300, liters: 25,
      price_per_liter: 10, total_cost: 250, is_full_tank: true, notes: null,
      created_at: new Date().toISOString(), updatedAt: ts, ...over,
    });

    const res = await syncPost(makeReq('/api/sync', {
      method: 'POST', headers: token,
      body: JSON.stringify({
        deviceId: 'devRoute5', since: 0,
        pushed: {
          fuel_logs: {
            upsert: [
              fuel('rc_f_ok'),
              fuel('rc_f_bad', { odometer: -50 }),               // Zod: nonnegative odometer
              fuel('rc_f_str', { liters: 'twenty-five' }),       // non-numeric junk stays → Zod positive fails
              fuel('rc_f_miss', { fill_date: null }),            // required NOT NULL column
            ],
          },
        },
      }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.data;

    // New contract: reasons are invalid_payload:<field>:<message>, per row.
    const reasons = Object.fromEntries(data.rejected.map((x: any) => [x.id, x.reason]));
    expect(data.rejected).toHaveLength(3);
    expect(reasons.rc_f_bad).toMatch(/^invalid_payload:odometer/);
    expect(reasons.rc_f_str).toMatch(/^invalid_payload:liters/);
    expect(reasons.rc_f_miss).toMatch(/^invalid_payload:fill_date/);
    expect(reasons.rc_f_ok).toBeUndefined();

    // Valid siblings still applied, and `applied` lists exactly the accepted rows.
    expect(data.applied).toContainEqual({ table: 'fuel_logs', id: 'rc_f_ok', kind: 'upsert' });
    for (const bad of ['rc_f_bad', 'rc_f_str', 'rc_f_miss']) {
      expect(data.applied.find((a: any) => a.id === bad)).toBeUndefined();
    }

    // Persisted reality: only the valid row is on disk; refusals never poisoned the batch.
    const { client } = await getDatabase();
    const rows = await client.execute({
      sql: "SELECT id FROM fuel_logs WHERE id IN ('rc_f_ok','rc_f_bad','rc_f_str','rc_f_miss')",
      args: [],
    });
    expect(rows.rows.map((r: any) => r.id)).toEqual(['rc_f_ok']);
  });

  it('clamps a far-future client clock so it cannot outrank server state', async () => {
    const token = bearer(signAccessToken(SYNC_USER));
    const iso = new Date().toISOString();
    const future = Date.now() + 30 * 24 * 3600 * 1000;
    const res = await syncPost(makeReq('/api/sync', {
      method: 'POST', headers: token,
      body: JSON.stringify({
        deviceId: 'devSkew', since: 0,
        pushed: {
          vehicles: {
            upsert: [{
              id: V1, name: 'Future Hack', make: 'Toyota', model: 'Corolla', year: 2020,
              license_plate: null, initial_odometer: 0, current_odometer: 100,
              recommended_oil: null, specs: null, created_at: iso, updated_at: iso,
              updatedAt: future,
            }],
          },
        },
      }),
    }));
    const body = await res.json();
    // Existing row's sync_ts is a real server-accepted time; a clock beyond
    // server+60s is untrustworthy and must lose (dropped, not rejected).
    expect(body.data.applied?.find((a: any) => a.id === V1)).toBeUndefined();
    expect(body.data.rejected).toEqual([]);

    const check = await syncPost(makeReq('/api/sync', {
      method: 'POST', headers: token,
      body: JSON.stringify({ deviceId: 'devSkew2', since: 0 }),
    }));
    const checkBody = await check.json();
    expect(checkBody.data.pulled.vehicles.upsert.find((v: any) => v.id === V1).name).not.toBe('Future Hack');
  });
});

// ---------------------------------------------------------------------------
// /api/backup GET
// ---------------------------------------------------------------------------
describe('/api/backup GET', () => {
  it('requires authentication', async () => {
    const res = await backupGet(makeReq('/api/backup'));
    expect(res.status).toBe(401);
    expect((await res.json()).success).toBe(false);
  });

  it('returns the authenticated user\'s account as a well-shaped portable backup document', async () => {
    const vehicle = await repo.createVehicle(
      { name: 'Backup Car', make: 'Nissan', model: 'Sunny', year: 2021, initialOdometer: 100, currentOdometer: 100 },
      BACKUP_USER.id,
    );
    await repo.addFuelLog({
      vehicleId: vehicle.id!, fillDate: '2026-05-01', odometer: 200, liters: 20,
      pricePerLiter: 10, totalCost: 200, isFullTank: true,
    });

    const res = await backupGet(makeReq('/api/backup', { headers: bearer(signAccessToken(BACKUP_USER)) }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="carbook-backup-\d{4}-\d{2}-\d{2}\.json"$/);

    const doc = await res.json();
    expect(doc.kind).toBe('carbook-backup');
    expect(doc.version).toBe(1);
    expect(typeof doc.exportedAt).toBe('string');
    expect(Number.isNaN(Date.parse(doc.exportedAt))).toBe(false);
    expect(Object.keys(doc.tables).sort()).toEqual(
      ['fuel_logs', 'maintenance_logs', 'maintenance_schedules', 'vehicles'].sort(),
    );
    expect(doc.counts.vehicles).toBeGreaterThanOrEqual(1);
    expect(doc.tables.vehicles.find((v: any) => v.id === vehicle.id)).toBeTruthy();
    expect(doc.tables.fuel_logs.find((f: any) => f.vehicle_id === vehicle.id)).toBeTruthy();

    // Data is scoped to the caller: no other tenant's rows leak into the file.
    expect(doc.tables.vehicles.every((v: any) => v.id !== V1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// /api/reports GET
// ---------------------------------------------------------------------------
describe('/api/reports GET — per-vehicle aggregation', () => {
  const token = () => bearer(signAccessToken(REPORTS_USER));
  let vehicleId: string;

  beforeAll(async () => {
    const vehicle = await repo.createVehicle(
      { name: 'Report Car', make: 'Hyundai', model: 'Elantra', year: 2022, initialOdometer: 50000, currentOdometer: 50500 },
      REPORTS_USER.id,
    );
    vehicleId = vehicle.id!;
    // Two full-tank fills: window 50000→50500 consumed 35 L / 525 EGP.
    await repo.addFuelLog({
      vehicleId, fillDate: '2026-06-01', odometer: 50000, liters: 40,
      pricePerLiter: 15, totalCost: 600, isFullTank: true,
    });
    await repo.addFuelLog({
      vehicleId, fillDate: '2026-06-10', odometer: 50500, liters: 35,
      pricePerLiter: 15, totalCost: 525, isFullTank: true,
    });
    await repo.addMaintenanceLog({
      vehicleId, serviceDate: '2026-06-05', odometer: 50300, serviceType: 'oil_change',
      title: 'زيت', partsCost: 1200, laborCost: 150, totalCost: 1350,
    });
    await repo.addMaintenanceSchedule({
      vehicleId, itemCode: 'engine_oil', titleAr: 'زيت المحرك', titleEn: 'Engine Oil',
      intervalKm: 10000, intervalMonths: 6, lastDoneOdometer: 50000, lastDoneDate: '2026-06-01',
    });
  });

  it('rejects missing vehicleId (400) and anonymous callers (401)', async () => {
    const missing = await reportsGet(makeReq('/api/reports', { headers: token() }));
    expect(missing.status).toBe(400);

    const anon = await reportsGet(makeReq(`/api/reports?vehicleId=${vehicleId}`));
    expect(anon.status).toBe(401);
  });

  it('aggregates seeded fuel, maintenance and schedule data for the owning user', async () => {
    const res = await reportsGet(makeReq(`/api/reports?vehicleId=${vehicleId}`, { headers: token() }));
    expect(res.status).toBe(200);
    const { success, data } = await res.json();
    expect(success).toBe(true);

    expect(data.vehicle.id).toBe(vehicleId);
    expect(data.summary.totalFuelCost).toBeCloseTo(1125, 2);   // 600 + 525
    expect(data.summary.totalFuelLiters).toBeCloseTo(75, 2);   // 40 + 35
    expect(data.summary.totalMaintenanceCost).toBeCloseTo(1350, 2);
    expect(data.summary.totalExpenses).toBeCloseTo(2475, 2);
    expect(data.summary.fuelLogsCount).toBe(2);
    expect(data.summary.maintenanceLogsCount).toBe(1);
    // Only the closed full-tank window counts: (35 / 500) * 100 = 7.0 L/100km.
    expect(data.summary.averageLitersPer100Km).toBeCloseTo(7.0, 2);

    // Route reality (asserted against the landed handler, not assumptions):
    // data.fuelLogs are the RAW repository rows — consumption metrics are only
    // folded into summary.averageLitersPer100Km here; per-log metrics come
    // from GET /api/fuel (enrichFuelMetrics), covered in tests/apiAuth.test.ts.
    expect(data.fuelLogs).toHaveLength(2);
    expect(data.fuelLogs[0]).not.toHaveProperty('litersPer100Km');

    expect(data.schedules).toHaveLength(1);
    expect(data.schedules[0].remainingKm).toBe(9500); // 50000 + 10000 - 50500
    expect(['ok', 'due_soon', 'overdue']).toContain(data.schedules[0].status);
  });

  it('hides another tenant\'s vehicle with 404, not 403', async () => {
    const res = await reportsGet(makeReq(`/api/reports?vehicleId=${vehicleId}`, {
      headers: bearer(signAccessToken(SYNC_USER)),
    }));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// /api/settings/fuel-prices GET
// ---------------------------------------------------------------------------
describe('/api/settings/fuel-prices GET — EG presets', () => {
  const token = bearer(signAccessToken(PRICES_USER));

  it('requires authentication', async () => {
    const res = await fuelPricesGet(makeReq('/api/settings/fuel-prices'));
    expect(res.status).toBe(401);
  });

  it('serves the Egypt preset exactly (95:24.00 92:22.25 80:20.75 diesel:20.50 cng:13.00)', async () => {
    const res = await fuelPricesGet(makeReq('/api/settings/fuel-prices', { headers: token }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.current.countryCode).toBe('EG');
    expect(data.current.currency).toBe('EGP');

    const byId = Object.fromEntries(data.current.fuelTypes.map((f: any) => [f.id, f.price]));
    expect(byId.gasoline_95).toBe(24.00);
    expect(byId.gasoline_92).toBe(22.25);
    expect(byId.gasoline_80).toBe(20.75);
    expect(byId.diesel).toBe(20.50);
    expect(byId.cng).toBe(13.00);

    expect(Array.isArray(data.supportedCountries)).toBe(true);
    expect(data.supportedCountries.find((c: any) => c.countryCode === 'EG')).toBeTruthy();
  });

  it('resolves country via ?country= and timezone detection via ?tz=', async () => {
    const byCountry = await fuelPricesGet(makeReq('/api/settings/fuel-prices?country=SA', { headers: token }));
    expect((await byCountry.json()).data.current.countryCode).toBe('SA');

    const byTz = await fuelPricesGet(makeReq('/api/settings/fuel-prices?tz=Africa/Cairo', { headers: token }));
    expect((await byTz.json()).data.current.countryCode).toBe('EG');

    // Unknown country falls back to Egypt (the documented default).
    const unknown = await fuelPricesGet(makeReq('/api/settings/fuel-prices?country=ZZ', { headers: token }));
    expect((await unknown.json()).data.current.countryCode).toBe('EG');
  });
});

// ---------------------------------------------------------------------------
// /api/auth/callback/google — CSRF gate + cookie flags
// ---------------------------------------------------------------------------
describe('/api/auth/callback/google — cookie flags and CSRF gate', () => {
  const GOOGLE_SUB = 'rc_google_user_1';

  function callbackUrl(nonce: string, withCode = true) {
    const state = encodeURIComponent(JSON.stringify({ source: 'web', nonce }));
    return `/api/auth/callback/google?${withCode ? 'code=rc-fake-auth-code&' : ''}state=${state}`;
  }
  function nonceCookie(nonce: string) {
    return { Cookie: `${OAUTH_NONCE_COOKIE}=${nonce}` };
  }

  beforeEach(() => stubGoogleFetch(GOOGLE_SUB));
  afterAll(() => vi.unstubAllGlobals());

  it('rejects forged state with 400 invalid_oauth_state and burns the nonce cookie', async () => {
    const forged = crypto.randomBytes(32).toString('base64url');
    const res = await googleCallback(makeReq(callbackUrl(forged)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_oauth_state');
    const raw = res.headers.get('set-cookie')!;
    expect(raw).toContain(`${OAUTH_NONCE_COOKIE}=;`);
    expect(raw).toContain('Max-Age=0');
    // The rejection path must not mint a session.
    expect(raw).not.toContain('carbook_session=');
  });

  it('mints the session cookie with HttpOnly; Secure; SameSite and clears the nonce on its callback path (production flags)', async () => {
    // Secure is emitted only in production (see src/services/auth.ts) — pin
    // NODE_ENV for this case only, and restore it afterwards.
    const prevEnv = process.env.NODE_ENV;
    Object.assign(process.env, { NODE_ENV: 'production' });
    try {
      const nonce = crypto.randomBytes(32).toString('base64url');
      const res = await googleCallback(makeReq(callbackUrl(nonce), { headers: nonceCookie(nonce) }));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3070/');

      const rawCookies = res.headers.get('set-cookie')!;
      const cookieLines = rawCookies.split(/,(?=[^;]+?=)/);
      const sessionLine = cookieLines.find((l) => l.includes('carbook_session='))!;
      const nonceLine = cookieLines.find((l) => l.includes(`${OAUTH_NONCE_COOKIE}=`))!;

      // Session cookie: durable auth material must never be JS-readable,
      // transport-secure on the wire, lax for CSRF, root-path.
      expect(/HttpOnly/i.test(sessionLine)).toBe(true);
      expect(/Secure/i.test(sessionLine)).toBe(true);
      expect(/SameSite=Lax/i.test(sessionLine)).toBe(true);
      expect(/Path=\//.test(sessionLine)).toBe(true);
      expect(/Max-Age=\d{5,}/.test(sessionLine)).toBe(true); // 7-day TTL, not a session cookie

      // Nonce cookie is burned, and its scope stays callback-path-only.
      expect(nonceLine).toContain(`${OAUTH_NONCE_COOKIE}=`);
      expect(/Path=\/api\/auth\/callback/i.test(nonceLine)).toBe(true);
      expect(/Max-Age=0/.test(nonceLine)).toBe(true);

      // The minted cookie is a real session token (never echoed in the URL).
      expect(res.headers.get('location')).not.toMatch(/token=/);
      const match = sessionLine.match(/carbook_session=([^;]+)/)!;
      const { verifySessionToken } = await import('@/services/auth');
      expect(verifySessionToken(match[1])?.id).toBe(GOOGLE_SUB);
    } finally {
      Object.assign(process.env, { NODE_ENV: prevEnv });
    }
  });

  it('in non-production the session cookie omits Secure but keeps HttpOnly + SameSite=lax', async () => {
    const nonce = crypto.randomBytes(32).toString('base64url');
    const res = await googleCallback(makeReq(callbackUrl(nonce), { headers: nonceCookie(nonce) }));
    expect(res.status).toBe(307);
    const raw = res.headers.get('set-cookie')!;
    expect(/HttpOnly/i.test(raw)).toBe(true);
    expect(/SameSite=Lax/i.test(raw)).toBe(true);
    expect(/Secure/i.test(raw)).toBe(false);
  });

  // TODO(T9 → session agent): jti revocation (logout deny-list) and the
  // login/callback rate limiter are landing in the session slice. Do not pin
  // current no-revocation / no-throttle behavior here; these gates will be
  // covered in final validation.
});
