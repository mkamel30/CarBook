import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

// The routes resolve their DB at construction time from CARBOOK_DB_PATH, so the
// env var must be set before the first handler runs. Use an OS tmpdir DB so this
// file never touches the repo working tree.
const dbPath = path.join(os.tmpdir(), `carbook_handoff_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
process.env.CARBOOK_DB_PATH = dbPath;
process.env.JWT_SECRET = 'handoff_test_secret_key_padded_for_dev';
process.env.APP_ORIGIN = 'http://localhost:3070';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

import { getDatabase } from '@/persistence/db';
import { OAUTH_NONCE_COOKIE, signSessionToken } from '@/services/auth';
import { issueOneTimeCode, redeemOneTimeCode } from '@/services/deviceAuth';
import { GET as login } from '@/app/api/auth/login/route';
import { GET as callback } from '@/app/api/auth/callback/google/route';
import { GET as tokenLogin } from '@/app/api/auth/token-login/route';
import { GET as appLogin } from '@/app/app-login/route';

const GOOGLE_AUTH_CODE = 'google-oauth-code-xyz';
const GOOGLE_SUB = 'google_handoff_user_1';

function makeReq(urlPath: string, init: any = {}): NextRequest {
  return new NextRequest(`http://localhost:3070${urlPath}`, init);
}

/** Fake the two outbound Google calls the callback makes (token + userinfo). */
function stubGoogleFetch(sub = GOOGLE_SUB) {
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com/token')) {
      return { ok: true, status: 200, text: async () => '', json: async () => ({ access_token: 'ya29.fake' }) };
    }
    if (u.includes('googleapis.com/oauth2/v3/userinfo')) {
      return { ok: true, status: 200, json: async () => ({ sub, email: `${sub}@example.com`, name: 'Handoff User', picture: null }) };
    }
    throw new Error(`unexpected fetch: ${u}`);
  }));
}

function nonceCookie(nonce: string) {
  return { Cookie: `${OAUTH_NONCE_COOKIE}=${nonce}` };
}

function callbackUrl(source: 'app' | 'web', nonce: string, extraCode = GOOGLE_AUTH_CODE) {
  const state = encodeURIComponent(JSON.stringify({ source, nonce }));
  const q = extraCode ? `code=${extraCode}&state=${state}` : `state=${state}`;
  return `/api/auth/callback/google?${q}`;
}

function appHandoffCode(res: Response): string | null {
  const location = res.headers.get('location');
  if (!location) return null;
  return new URL(location).searchParams.get('code');
}

async function setCodeRow(code: string, patch: { exp?: number; used?: number }) {
  const { client } = await getDatabase();
  const id = crypto.createHash('sha256').update(code).digest('hex');
  if (patch.exp !== undefined) {
    await client.execute({ sql: 'UPDATE auth_codes SET exp = ? WHERE id = ?', args: [patch.exp, id] });
  }
  if (patch.used !== undefined) {
    await client.execute({ sql: 'UPDATE auth_codes SET used = ? WHERE id = ?', args: [patch.used, id] });
  }
}

beforeAll(async () => {
  stubGoogleFetch();
  // Force table creation before the first handler.
  await getDatabase();
});

afterAll(() => {
  vi.unstubAllGlobals();
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

describe('OAuth login mints a state nonce + cookie', () => {
  it('embeds a nonce in state and mirrors it in a short-lived httpOnly callback-scoped cookie', async () => {
    const res = await login(makeReq('/api/auth/login?source=app', { headers: { 'User-Agent': 'android-client' } }));
    expect(res.status).toBe(307);

    const location = res.headers.get('location')!;
    const state = JSON.parse(new URL(location).searchParams.get('state')!);
    expect(state.source).toBe('app');
    expect(typeof state.nonce).toBe('string');
    expect(state.nonce.length).toBeGreaterThan(20);

    const cookie = res.cookies.get(OAUTH_NONCE_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie!.value).toBe(state.nonce);
    // CSRF cookie attributes asserted from the raw Set-Cookie header: httpOnly,
    // SameSite=lax, callback path scope, 10-minute lifetime.
    const raw = res.headers.get('set-cookie')!;
    expect(raw).toContain(`${OAUTH_NONCE_COOKIE}=`);
    expect(/HttpOnly/i.test(raw)).toBe(true);
    expect(/SameSite=Lax/i.test(raw)).toBe(true);
    expect(/Path=\/api\/auth\/callback/i.test(raw)).toBe(true);
    expect(/Max-Age=600/i.test(raw)).toBe(true);
  });
});

describe('OAuth callback state CSRF', () => {
  beforeEach(() => stubGoogleFetch());

  it('rejects a forged state when no nonce cookie is present (400)', async () => {
    const forgedNonce = crypto.randomBytes(32).toString('base64url');
    const res = await callback(makeReq(callbackUrl('web', forgedNonce)));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_oauth_state');
  });

  it('rejects a mismatched cookie vs state nonce (400)', async () => {
    const inCookie = crypto.randomBytes(32).toString('base64url');
    const inState = crypto.randomBytes(32).toString('base64url');
    const res = await callback(
      makeReq(callbackUrl('web', inState), { headers: nonceCookie(inCookie) }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects when the state is missing entirely (400), even with a valid cookie', async () => {
    const inCookie = crypto.randomBytes(32).toString('base64url');
    const res = await callback(makeReq('/api/auth/callback/google?code=abc', { headers: nonceCookie(inCookie) }));
    expect(res.status).toBe(400);
  });

  it('passes for a matching nonce on the WEB flow and clears the nonce cookie', async () => {
    const nonce = crypto.randomBytes(32).toString('base64url');
    const res = await callback(makeReq(callbackUrl('web', nonce), { headers: nonceCookie(nonce) }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3070/');
    // No durable token anywhere in the web redirect URL.
    expect(res.headers.get('location')).not.toContain('token=');
    // Session cookie is set (httpOnly, SameSite=lax) ...
    const session = res.cookies.get('carbook_session');
    expect(session?.value).toBeTruthy();
    // ...and the CSRF nonce cookie is burned (empty value + expired lifetime).
    const rawCookies = res.headers.get('set-cookie')!;
    expect(rawCookies).toContain(`${OAUTH_NONCE_COOKIE}=;`);
    expect(/Max-Age=0/i.test(rawCookies)).toBe(true);
    expect(/carbook_session=[^;]/.test(rawCookies)).toBe(true);
  });
});

describe('One-time deep-link code handoff', () => {
  it('app callback redirects to the App Link handoff page with ?code= (never a durable token)', async () => {
    const nonce = crypto.randomBytes(32).toString('base64url');
    const res = await callback(
      makeReq(callbackUrl('app', nonce), { headers: { ...nonceCookie(nonce), 'User-Agent': 'android-webview' } }),
    );
    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(location).toContain('/app-login?code=');
    expect(location).not.toContain('token=');
    expect(new URL(location).searchParams.get('code')).toBeTruthy();
    // No session cookie is minted for the app handoff (the app redeems the code).
    expect(res.cookies.get('carbook_session')).toBeUndefined();
  });

  it('valid code -> session cookie set + 302/307 redirect to /', async () => {
    const nonce = crypto.randomBytes(32).toString('base64url');
    const cb = await callback(
      makeReq(callbackUrl('app', nonce), { headers: { ...nonceCookie(nonce), 'User-Agent': 'android-webview' } }),
    );
    const code = appHandoffCode(cb)!;

    const res = await tokenLogin(makeReq(`/api/auth/token-login?code=${encodeURIComponent(code)}`));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3070/');
    // The redirect Location must not echo the code back into a URL.
    expect(res.headers.get('location')).not.toContain('code=');
    const session = res.cookies.get('carbook_session');
    expect(session?.value).toBeTruthy();
    // The minted cookie is a real, verifiable session token.
    const { verifySessionToken } = await import('@/services/auth');
    expect(verifySessionToken(session!.value)?.id).toBe(GOOGLE_SUB);
  });

  it('redeeming the same code a second time is rejected with 401 (single use)', async () => {
    const nonce = crypto.randomBytes(32).toString('base64url');
    const cb = await callback(
      makeReq(callbackUrl('app', nonce), { headers: { ...nonceCookie(nonce), 'User-Agent': 'android-webview' } }),
    );
    const code = appHandoffCode(cb)!;

    const first = await tokenLogin(makeReq(`/api/auth/token-login?code=${encodeURIComponent(code)}`));
    expect(first.status).toBe(307);

    const second = await tokenLogin(makeReq(`/api/auth/token-login?code=${encodeURIComponent(code)}`));
    expect(second.status).toBe(401);
    expect(second.cookies.get('carbook_session')).toBeUndefined();
  });

  it('an expired code is rejected with 401', async () => {
    const code = await issueOneTimeCode(GOOGLE_SUB);
    await setCodeRow(code, { exp: Math.floor(Date.now() / 1000) - 60 });

    const res = await tokenLogin(makeReq(`/api/auth/token-login?code=${encodeURIComponent(code)}`));
    expect(res.status).toBe(401);
  });

  it('an already-used code is rejected with 401', async () => {
    const code = await issueOneTimeCode(GOOGLE_SUB);
    await setCodeRow(code, { used: 1 });

    const res = await tokenLogin(makeReq(`/api/auth/token-login?code=${encodeURIComponent(code)}`));
    expect(res.status).toBe(401);
  });

  it('redeemOneTimeCode returns the owner once, then null', async () => {
    const code = await issueOneTimeCode(GOOGLE_SUB);
    expect(await redeemOneTimeCode(code)).toBe(GOOGLE_SUB);
    expect(await redeemOneTimeCode(code)).toBeNull();
    expect(await redeemOneTimeCode('totally-unknown-code-value-1234567890')).toBeNull();
  });

  it('a bad code request body does not leak the code back', async () => {
    const res = await tokenLogin(makeReq('/api/auth/token-login?code=not-a-real-code-abcdef123456'));
    expect(res.status).toBe(401);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('not-a-real-code');
  });
});

describe('Legacy ?token= dual-read (transition window)', () => {
  it('still accepts a valid legacy session token and sets the cookie', async () => {
    const legacyToken = signSessionToken({ id: 'legacy_user', email: 'l@example.com', name: 'Legacy', picture: null }, 30);
    const res = await tokenLogin(makeReq(`/api/auth/token-login?token=${encodeURIComponent(legacyToken)}`));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3070/');
    expect(res.cookies.get('carbook_session')?.value).toBe(legacyToken);
  });

  it('missing token (no code, no token) still redirects with auth_error=missing_token', async () => {
    const res = await tokenLogin(makeReq('/api/auth/token-login'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('auth_error=missing_token');
  });

  it('invalid legacy token still redirects with auth_error=invalid_token', async () => {
    const res = await tokenLogin(makeReq('/api/auth/token-login?token=not.a.jwt'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('auth_error=invalid_token');
  });
});

describe('verifySessionToken exp + constant-time', () => {
  it('rejects a token minted without an exp claim', async () => {
    const { verifySessionToken } = await import('@/services/auth');
    // Craft an exp-less but correctly-signed HS256 JWT to prove additive expiry check.
    const b64u = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const header = b64u({ alg: 'HS256', typ: 'JWT' });
    const payload = b64u({ id: 'x', email: 'x@e.com', name: 'X', picture: null });
    const cryptoMod = await import('crypto');
    const sig = cryptoMod
      .createHmac('sha256', process.env.JWT_SECRET!)
      .update(`${header}.${payload}`)
      .digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(verifySessionToken(`${header}.${payload}.${sig}`)).toBeNull();
  });

  it('still accepts a normally signed token (has exp)', async () => {
    const { verifySessionToken } = await import('@/services/auth');
    const t = signSessionToken({ id: 'u', email: 'u@e.com', name: 'U', picture: null }, 1);
    expect(verifySessionToken(t)?.id).toBe('u');
  });
});

describe('App Link handoff page (/app-login)', () => {
  it('renders the tap-to-open page carrying the carbook:// deep link, uncacheable', async () => {
    const code = 'a'.repeat(43);
    const res = await appLogin(makeReq(`/app-login?code=${code}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const html = await res.text();
    expect(html).toContain(`carbook://login?code=${code}`);
    expect(html).not.toContain('token=');
  });

  it('redirects home with auth_error when neither code nor token is present', async () => {
    const res = await appLogin(makeReq('/app-login'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('auth_error=missing_code');
  });
});
