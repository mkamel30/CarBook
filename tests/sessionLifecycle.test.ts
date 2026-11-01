import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

// T6: 7-day web sessions with server-side jti revocation + in-route rate limiting.
// DB lives in the OS temp dir (never the repo working tree); env vars must be set
// before the first getDatabase() call, not merely before the imports.
const dbPath = path.join(os.tmpdir(), `carbook_lifecycle_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
process.env.CARBOOK_DB_PATH = dbPath;
process.env.JWT_SECRET = 'session_lifecycle_test_secret_key';
process.env.APP_ORIGIN = 'http://localhost:3070';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

import { getDatabase } from '@/persistence/db';
import {
  WEB_SESSION_TTL_DAYS,
  clearRevocationCache,
  loadRevocations,
  revokeSessionByToken,
  signSessionToken,
  verifySessionToken,
} from '@/services/auth';
import {
  buildRateLimitResponse,
  createRateLimiter,
  getClientIp,
  loginLimiter,
} from '@/services/rateLimit';
import { GET as logoutGet, POST as logoutPost } from '@/app/api/auth/logout/route';
import { GET as loginGet } from '@/app/api/auth/login/route';

const USER = { id: 'jti_user_1', email: 'j@example.com', name: 'Jti User', picture: null };

function makeReq(urlPath: string, init: any = {}): NextRequest {
  return new NextRequest(`http://localhost:3070${urlPath}`, init);
}

function cookieReq(token: string): NextRequest {
  return makeReq('/api/auth/logout', { headers: { Cookie: `carbook_session=${token}` } });
}

function decodePayload(token: string): any {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(b64, 'base64').toString());
}

/** A pre-T6 token shape: valid signature + exp but NO jti (the legacy mint). */
function craftLegacyToken(user: typeof USER, daysAhead: number): string {
  const b64u = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header = b64u({ alg: 'HS256', typ: 'JWT' });
  const payload = b64u({ ...user, exp: Math.floor(Date.now() / 1000) + daysAhead * 86400 });
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET!)
    .update(`${header}.${payload}`)
    .digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payload}.${sig}`;
}

async function revocationRows(): Promise<any[]> {
  const { client } = await getDatabase();
  const res = await client.execute({ sql: 'SELECT jti, exp FROM revocations', args: [] });
  return res.rows as any[];
}

beforeAll(async () => {
  await getDatabase(); // force table creation
});

beforeEach(() => {
  clearRevocationCache(); // hermetic: each case starts with an empty deny list
});

afterAll(() => {
  clearRevocationCache();
  loginLimiter.reset();
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

describe('web session TTL + jti', () => {
  it('mints 7-day tokens carrying a random jti, and they verify', () => {
    const t1 = Math.floor(Date.now() / 1000);
    const token = signSessionToken(USER);
    const t2 = Math.floor(Date.now() / 1000);
    const payload = decodePayload(token);
    expect(WEB_SESSION_TTL_DAYS).toBe(7);
    // exp was stamped between t1 and t2, so both bounds hold across a second tick.
    expect(payload.exp - t1).toBeGreaterThanOrEqual(7 * 86400);
    expect(payload.exp - t2).toBeLessThanOrEqual(7 * 86400);
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti).toMatch(/^[0-9a-f]{16,}$/);
    expect(verifySessionToken(token)?.id).toBe(USER.id);
  });

  it('explicit expiry arguments still work (legacy 30-day mint during transition)', () => {
    const t1 = Math.floor(Date.now() / 1000);
    const token = signSessionToken(USER, 30);
    const t2 = Math.floor(Date.now() / 1000);
    expect(decodePayload(token).exp - t1).toBeGreaterThanOrEqual(30 * 86400);
    expect(decodePayload(token).exp - t2).toBeLessThanOrEqual(30 * 86400);
    expect(verifySessionToken(token)?.id).toBe(USER.id);
  });
});

describe('server-side revocation via logout', () => {
  it('a jti token revoked by GET logout fails verification afterwards', async () => {
    const token = signSessionToken(USER);
    expect(verifySessionToken(token)).not.toBeNull();

    const res = await logoutGet(cookieReq(token));
    expect(res.status).toBe(307);
    // cookie is burned...
    const raw = res.headers.get('set-cookie')!;
    expect(/carbook_session=;/.test(raw)).toBe(true);
    expect(/Max-Age=0/i.test(raw)).toBe(true);
    // ...and the session is dead server-side.
    expect(verifySessionToken(token)).toBeNull();

    const jti = decodePayload(token).jti;
    const row = (await revocationRows()).find((r) => r.jti === jti);
    expect(row).toBeTruthy();
    expect(Number(row.exp)).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('POST logout revokes too', async () => {
    const token = signSessionToken(USER);
    const res = await logoutPost(cookieReq(token));
    expect(res.status).toBe(200);
    expect(verifySessionToken(token)).toBeNull();
  });

  it('revocation survives a simulated restart: cache cleared, rehydrated from the DB', async () => {
    const token = signSessionToken(USER);
    const revoked = await revokeSessionByToken(token);
    expect(revoked).toBe(true);

    clearRevocationCache();
    expect(verifySessionToken(token)).not.toBeNull(); // cache-only proof of the reload step
    const loaded = await loadRevocations();
    expect(loaded).toBeGreaterThan(0);
    expect(verifySessionToken(token)).toBeNull();
  });

  it('forged or junk cookies create no revocation rows', async () => {
    const before = (await revocationRows()).length;
    expect(await revokeSessionByToken('not.a.jwt')).toBe(false);
    expect(await revokeSessionByToken('a.b.c')).toBe(false);
    // Valid shape, wrong signature: cannot authenticate, so no deny-list entry.
    const tampered = signSessionToken(USER).slice(0, -5) + 'XXXXX';
    expect(await revokeSessionByToken(tampered)).toBe(false);
    expect((await revocationRows()).length).toBe(before);
  });
});

describe('legacy jti-less tokens (transition dual-read)', () => {
  it('still verify, and logout cannot revoke them (additive guarantee)', async () => {
    const legacy = craftLegacyToken(USER, 30);
    expect(verifySessionToken(legacy)?.id).toBe(USER.id);

    const before = (await revocationRows()).length;
    const res = await logoutGet(cookieReq(legacy));
    expect(res.status).toBe(307);
    // Cookie cleared, but the token itself remains valid until its exp —
    // exactly the pre-T6 behaviour the 2026-12-01 dual-read window depends on.
    expect(verifySessionToken(legacy)).not.toBeNull();
    expect((await revocationRows()).length).toBe(before);
  });
});

describe('expiry enforcement', () => {
  it('an expired token fails verification and is not revocable', async () => {
    const expired = signSessionToken(USER, -1);
    expect(verifySessionToken(expired)).toBeNull();
    expect(await revokeSessionByToken(expired)).toBe(false);
  });
});

describe('sliding-window rate limiter', () => {
  it('blocks the 11th rapid call and recovers once the window slides past', async () => {
    let clock = 1_700_000_000_000;
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, now: () => clock });

    for (let i = 0; i < 10; i++) {
      const r = await limiter.check('203.0.113.5');
      expect(r.allowed).toBe(true);
    }
    const blocked = await limiter.check('203.0.113.5');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);

    // A different identity has its own budget.
    expect((await limiter.check('198.51.100.9')).allowed).toBe(true);

    clock += 60_001; // every recorded hit is now outside the window
    const recovered = await limiter.check('203.0.113.5');
    expect(recovered.allowed).toBe(true);
  });

  it('evicts stale keys to keep the map bounded', async () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 3, now: () => clock });
    await limiter.check('k1');
    await limiter.check('k2');
    await limiter.check('k3');
    expect(limiter.size()).toBe(3);
    clock = 10;
    await limiter.check('k4'); // full: oldest key (k1) is evicted
    expect(limiter.size()).toBeLessThanOrEqual(3);
    // k1 is gone, so a fresh k1 gets a full budget again.
    expect((await limiter.check('k1')).allowed).toBe(true);
  });

  it('the 429 response carries a Retry-After header', () => {
    const res = buildRateLimitResponse({ allowed: false, retryAfterMs: 45_000, remaining: 0 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('45');
  });

  it('client IP comes from the first x-forwarded-for hop, advisory only', () => {
    expect(getClientIp(makeReq('/x', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } })))
      .toBe('203.0.113.7');
    expect(getClientIp(makeReq('/x'))).toBe('unknown');
  });

  it('the login route answers 429 on the 11th rapid call from one IP', async () => {
    loginLimiter.reset();
    const headers = { 'x-forwarded-for': '203.0.113.42' };
    for (let i = 0; i < 10; i++) {
      const res = await loginGet(makeReq('/api/auth/login', { headers }));
      expect(res.status).toBe(307);
    }
    const blocked = await loginGet(makeReq('/api/auth/login', { headers }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect((await blocked.json()).error).toBe('rate_limited');
    // A different IP is unaffected by the blocked one.
    const other = await loginGet(makeReq('/api/auth/login', { headers: { 'x-forwarded-for': '198.51.100.4' } }));
    expect(other.status).toBe(307);
    loginLimiter.reset();
  });
});
