import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

// Task #17 — the offline→account bearer bridge.
//
// A BUNDLED Capacitor app is served from its own local origin, so its
// cross-origin fetches can never carry the SameSite=lax `carbook_session`
// cookie. The bridge is: redeem the one-time code over POST JSON to get the
// durable session JWT, then present it as `Authorization: Bearer …`.
//
// The routes read CARBOOK_DB_PATH at construction time, so the env must be set
// before the first handler import runs. The DB lives in the OS temp dir: this
// file never touches the repo working tree.
const dbPath = path.join(os.tmpdir(), `carbook_bearer_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
process.env.CARBOOK_DB_PATH = dbPath;
process.env.JWT_SECRET = 'bearer_bridge_test_secret_key_padded';
process.env.APP_ORIGIN = 'https://localhost:3070';

import { getDatabase } from '@/persistence/db';
import { StorageRepository } from '@/persistence/repository';
import { clearRevocationCache, loadRevocations, revokeSessionByToken, verifySessionToken } from '@/services/auth';
import { issueOneTimeCode, registerDevice } from '@/services/deviceAuth';
import { requireUser } from '@/services/authz';
import { GET as tokenLoginGet, POST as tokenLoginPost } from '@/app/api/auth/token-login/route';
import { GET as meGet } from '@/app/api/auth/me/route';
import { POST as syncPost } from '@/app/api/sync/route';
import { PUT as deviceLinkPut } from '@/app/api/auth/device/route';
import { GET as vehiclesGet, POST as vehiclePost } from '@/app/api/vehicles/route';

const REAL_USER = 'bearer_google_sub_1';
const GUEST_DEVICE = 'bearer.device-1';

/**
 * token-login shares one 10/min limiter between GET and POST, so every request
 * here gets its own X-Forwarded-For bucket. Keeps the assertions about auth
 * semantics from being polluted by the abuse throttle.
 */
let ipSeq = 0;
function ip() {
  return `10.77.${Math.floor(ipSeq / 250) % 250}.${(ipSeq++ % 250) + 1}`;
}

function req(urlPath: string, init: any = {}, host = 'https://localhost:3070'): NextRequest {
  return new NextRequest(`${host}${urlPath}`, {
    ...init,
    headers: { ...(init.headers || {}), 'x-forwarded-for': ip() },
  });
}

function jsonReq(urlPath: string, body: unknown, headers: Record<string, string> = {}, host?: string): NextRequest {
  return req(urlPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }, host);
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** POST {code} against the secure handoff endpoint and hand back the response. */
function postCode(code: string | null, host?: string) {
  return tokenLoginPost(jsonReq('/api/auth/token-login', code === null ? {} : { code }, {}, host));
}

async function redeemToken(code: string): Promise<string> {
  const res = await postCode(code);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(typeof json.token).toBe('string');
  return json.token as string;
}

beforeAll(async () => {
  // Force table creation + the real account before the first handler runs.
  await getDatabase();
  const repo = new StorageRepository();
  await repo.findOrCreateUser({ id: REAL_USER, email: 'bearer@example.com', name: 'Bearer User' });
});

afterAll(() => {
  clearRevocationCache();
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

describe('token-login POST: code -> bearer session', () => {
  it('returns the durable session JWT + user as JSON, with no cookie and no-store', async () => {
    const code = await issueOneTimeCode(REAL_USER);
    const res = await postCode(code);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    // The response is JSON, never a redirect: the GET handoff is untouched.
    expect(res.headers.get('location')).toBeNull();
    // A bearer session must not also mint a cookie — one credential, one channel.
    expect(res.cookies.get('carbook_session')).toBeUndefined();

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user).toMatchObject({ id: REAL_USER, email: 'bearer@example.com', name: 'Bearer User' });
    // Real, verifiable session token carrying a revocable jti.
    const payload = verifySessionToken(json.token);
    expect(payload?.id).toBe(REAL_USER);
  });

  it('rejects a second redemption of the same code with 401 and leaks no token', async () => {
    const code = await issueOneTimeCode(REAL_USER);
    expect((await postCode(code)).status).toBe(200);

    const replay = await postCode(code);
    expect(replay.status).toBe(401);
    const json = await replay.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('invalid_code');
    expect(json.token).toBeUndefined();
  });

  it('shares one atomic single-use path across transports (GET spends, POST dies)', async () => {
    const code = await issueOneTimeCode(REAL_USER);
    const get = await tokenLoginGet(req(`/api/auth/token-login?code=${encodeURIComponent(code)}`));
    expect(get.status).toBe(307);
    expect(get.cookies.get('carbook_session')?.value).toBeTruthy();

    const post = await postCode(code);
    expect(post.status).toBe(401);
    expect((await post.json()).error).toBe('invalid_code');
  });

  it('rejects a missing or malformed body with 401 missing_code', async () => {
    const missing = await tokenLoginPost(jsonReq('/api/auth/token-login', {}, {}));
    expect(missing.status).toBe(401);
    expect((await missing.json()).error).toBe('missing_code');

    const malformed = await req('/api/auth/token-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{',
    });
    expect((await tokenLoginPost(malformed)).status).toBe(401);
  });

  it('refuses to mint a durable bearer over cleartext, and does not spend the code', async () => {
    const code = await issueOneTimeCode(REAL_USER);
    const insecure = await postCode(code, 'http://carbook.example.com');
    expect(insecure.status).toBe(403);
    expect((await insecure.json()).error).toBe('insecure_transport');

    // The 403 must be non-consumptive: the same code still works over https,
    // otherwise a misconfigured proxy would lock the user out of logging in.
    const secure = await postCode(code, 'https://carbook.example.com');
    expect(secure.status).toBe(200);
  });

  it('never writes the session token to the console (AGENTS rule 5)', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];
    try {
      const code = await issueOneTimeCode(REAL_USER);
      const token = await redeemToken(code);
      // And not on the request that USES it either.
      await meGet(req('/api/auth/me', { headers: bearer(token) }));
      const logged = spies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(' ')));
      expect(logged.some((line) => line.includes(token))).toBe(false);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  it('keeps the GET redirect behaviour the legacy ?token= dual-read still depends on', async () => {
    const code = await issueOneTimeCode(REAL_USER);
    const res = await tokenLoginGet(req(`/api/auth/token-login?code=${encodeURIComponent(code)}`));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://localhost:3070/');
    expect(res.headers.get('location')).not.toContain('code=');

    // No code at all still redirects to the app with an error flag, as before.
    const bare = await tokenLoginGet(req('/api/auth/token-login'));
    expect(bare.status).toBe(307);
    expect(bare.headers.get('location')).toContain('auth_error=missing_token');
  });
});

describe('Bearer accepted wherever the session cookie was', () => {
  it('/api/auth/me authenticates from the Authorization header', async () => {
    const token = await redeemToken(await issueOneTimeCode(REAL_USER));
    const json = await (await meGet(req('/api/auth/me', { headers: bearer(token) }))).json();
    expect(json.authenticated).toBe(true);
    expect(json.user.id).toBe(REAL_USER);
  });

  it('POST /api/sync runs the account sync with a bearer and no cookie', async () => {
    const token = await redeemToken(await issueOneTimeCode(REAL_USER));
    // Owned by the account, so it must come back down in the pull.
    const repo = new StorageRepository();
    const vehicle = await repo.createVehicle({
      name: 'Bearer Sync Car', make: 'Nissan', model: 'Sunny', year: 2019,
      initialOdometer: 10, currentOdometer: 20,
    } as any, REAL_USER);

    const res = await syncPost(jsonReq('/api/sync', { deviceId: GUEST_DEVICE, since: 0, pushed: {} }, bearer(token)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    const ids = (json.data.pulled?.vehicles?.upsert || []).map((r: any) => r.id);
    expect(ids).toContain(vehicle.id);
  });

  it('authz requireUser (via POST /api/vehicles) accepts the bearer', async () => {
    const token = await redeemToken(await issueOneTimeCode(REAL_USER));
    const res = await vehiclePost(jsonReq('/api/vehicles', {
      name: 'Bearer Linked Car', make: 'Toyota', model: 'Corolla', year: 2021,
      initialOdometer: 0, currentOdometer: 500,
    }, bearer(token)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Bearer Linked Car');
  });

  it('a bearer without a Bearer-scheme value still falls through to the cookie', () => {
    const token = 'basic-not-a-session-token';
    expect(() => requireUser(req('/api/vehicles', { headers: { Authorization: `Basic ${token}` } }))).toThrow();
  });

  it('PUT /api/auth/device links the guest device through the bearer and re-owns its rows', async () => {
    const repo = new StorageRepository();
    // The device's pre-login guest identity owns one vehicle already.
    const guest = await registerDevice(GUEST_DEVICE);
    expect(guest.user.guest).toBe(true);
    const guestVehicle = await repo.createVehicle({
      name: 'Guest Offline Car', make: 'Honda', model: 'Civic', year: 2018,
      initialOdometer: 0, currentOdometer: 100,
    } as any, guest.user.id);

    const accountToken = await redeemToken(await issueOneTimeCode(REAL_USER));
    const res = await deviceLinkPut(req('/api/auth/device', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...bearer(accountToken) },
      body: JSON.stringify({ deviceId: GUEST_DEVICE }),
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.user.id).toBe(REAL_USER);
    expect(json.data.user.guest).toBeUndefined();
    expect(json.data.movedVehicles).toBe(1);

    // The re-issued device access token is what the runtime keeps using, and the
    // claimed row is now visible to the account through the bearer path.
    const pulled = await (await syncPost(jsonReq('/api/sync',
      { deviceId: GUEST_DEVICE, since: 0, pushed: {} }, bearer(json.data.accessToken)))).json();
    const ids = (pulled.data.pulled?.vehicles?.upsert || []).map((r: any) => r.id);
    expect(ids).toContain(guestVehicle.id);

    const owned = await (await vehiclesGet(req('/api/vehicles', { headers: bearer(accountToken) }))).json();
    expect(owned.data.map((v: any) => v.id)).toContain(guestVehicle.id);
  });
});

describe('jti revocation applies to the bearer exactly as to the cookie', () => {
  it('a revoked bearer is rejected on me, sync and requireUser routes', async () => {
    clearRevocationCache();
    const token = await redeemToken(await issueOneTimeCode(REAL_USER));

    expect(await revokeSessionByToken(token)).toBe(true);

    const me = await (await meGet(req('/api/auth/me', { headers: bearer(token) }))).json();
    expect(me.authenticated).toBe(false);

    const sync = await syncPost(jsonReq('/api/sync', { deviceId: GUEST_DEVICE, since: 0, pushed: {} }, bearer(token)));
    expect(sync.status).toBe(401);

    const vehicles = await vehiclePost(jsonReq('/api/vehicles', { name: 'x' }, bearer(token)));
    expect(vehicles.status).toBe(401);

    // Same token presented as a cookie is rejected too — one deny list, both channels.
    const viaCookie = await (await meGet(req('/api/auth/me', { headers: { Cookie: `carbook_session=${token}` } }))).json();
    expect(viaCookie.authenticated).toBe(false);
  });

  it('revocation survives a restart: rehydrated jtis are still refused as bearer', async () => {
    const token = await redeemToken(await issueOneTimeCode(REAL_USER));
    await revokeSessionByToken(token);
    clearRevocationCache();
    expect(await loadRevocations()).toBeGreaterThan(0);

    const me = await (await meGet(req('/api/auth/me', { headers: bearer(token) }))).json();
    expect(me.authenticated).toBe(false);
  });
});

describe('Cookie session behaviour is unchanged by the bridge', () => {
  it('a cookie-only request still authenticates, with no Authorization header present', async () => {
    const code = await issueOneTimeCode(REAL_USER);
    const get = await tokenLoginGet(req(`/api/auth/token-login?code=${encodeURIComponent(code)}`));
    const sessionCookie = get.cookies.get('carbook_session')!.value;

    const me = await (await meGet(req('/api/auth/me', { headers: { Cookie: `carbook_session=${sessionCookie}` } }))).json();
    expect(me.authenticated).toBe(true);
    expect(me.user.id).toBe(REAL_USER);

    const sync = await syncPost(jsonReq('/api/sync', { deviceId: 'cookie.device-1', since: 0, pushed: {} }, { Cookie: `carbook_session=${sessionCookie}` }));
    expect(sync.status).toBe(200);
  });

  it('an unauthenticated request is still a 401, not a bearer hole', async () => {
    const sync = await syncPost(jsonReq('/api/sync', { deviceId: 'anon.device-1', since: 0, pushed: {} }));
    expect(sync.status).toBe(401);
    const forged = await meGet(req('/api/auth/me', { headers: bearer('header.payload.notsignature') }));
    expect((await forged.json()).authenticated).toBe(false);
  });
});
