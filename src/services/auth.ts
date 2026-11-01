import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../persistence/db';

export interface AuthSessionUser {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  guest?: boolean;
}

/**
 * Web session lifetime.
 *
 * T6 decision: new web session JWTs live 7 days instead of 30. A stolen cookie
 * therefore has a quarter of the previous blast radius, and a user who opens
 * the app at least weekly is never re-prompted (the OAuth login mints a fresh
 * cookie each time, which behaves like a sliding renewal).
 *
 * The 30-day window is NOT removed for verification: tokens already issued
 * before this change still pass verifySessionToken until their own exp, and
 * the legacy `?token=` dual-read in /api/auth/token-login keeps forwarding
 * them (no earlier than 2026-12-01 per that file). Only *newly minted*
 * sessions shrink to 7 days.
 */
export const WEB_SESSION_TTL_DAYS = 7;

/**
 * CSRF state cookie for the OAuth handoff.
 *
 * `path` scopes it to the callback family (`/api/auth/callback` also covers
 * `/api/auth/callback/google`), and SameSite=lax still sends it on the top-level
 * cross-site GET navigation Google performs back to us. 10 minutes is generous
 * for a human approving the prompt, but short enough that an abandoned handoff
 * dies with its nonce.
 */
export const OAUTH_NONCE_COOKIE = 'carbook_oauth_nonce';
export const OAUTH_NONCE_MAX_AGE_SECONDS = 10 * 60;

export function setOAuthNonceCookie(res: NextResponse, nonce: string): void {
  res.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/callback',
    maxAge: OAUTH_NONCE_MAX_AGE_SECONDS,
  });
}

/** Drop the nonce once it has been consumed so the same handoff cannot be replayed. */
export function clearOAuthNonceCookie(res: NextResponse): void {
  res.cookies.set(OAUTH_NONCE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/callback',
    maxAge: 0,
  });
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return 'carbook_jwt_dev_only_secret';
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString();
}

/**
 * Sign session JWT token.
 *
 * Every token minted from now on carries a random `jti` claim so it can be
 * revoked server-side (see revokeSessionToken). Tokens minted before this
 * change have no jti and keep verifying until their exp — the revocation
 * check in verifySessionToken only fires when a jti is present.
 */
export function signSessionToken(user: AuthSessionUser, expiresInDays = WEB_SESSION_TTL_DAYS): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60;
  const payload = { ...user, exp, jti: crypto.randomBytes(16).toString('hex') };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedHeader}.${encodedPayload}.${hmac(`${encodedHeader}.${encodedPayload}`)}`;
}

/**
 * Short-lived bearer token for the device app. The WebView cannot rely on the
 * cookie jar, so the phone authenticates with Authorization: Bearer instead.
 */
export function signAccessToken(user: AuthSessionUser, ttlSeconds = 15 * 60): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = { ...user, guest: user.guest === true, exp };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedHeader}.${encodedPayload}.${hmac(`${encodedHeader}.${encodedPayload}`)}`;
}

function hmac(data: string): string {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Compare two strings without leaking their contents through timing.
 *
 * Short-circuiting on the first differing byte tells an attacker how much of a
 * secret they have guessed, so every comparison runs over the full length. The
 * length is checked first because timingSafeEqual throws on unequal buffers,
 * and a differing length is already a definite mismatch.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Revoke a web session by its jti.
 *
 * The entry is kept in an in-process cache (checked synchronously by
 * verifySessionToken) AND persisted in the `revocations` table so a restart
 * cannot resurrect logged-out cookies. Single-process deployment assumption:
 * the app runs one Node server (self-host + Capacitor WebView against it), so
 * the process cache is coherent. `exp` is the revoked token's own expiry —
 * past that the token fails verification anyway and the row is garbage.
 */
const revokedJtis = new Map<string, number>();
const REVOCATION_CACHE_MAX = 50_000;
/** Upper bound on how long a revocation row is kept: the longest token life
 *  ever minted (the pre-T6 30-day legacy), so no revoked token can outlive its
 *  revocation, while junk exp values from forged cookies cannot grow the table
 *  without bound. */
const REVOCATION_RETENTION_SECONDS = 30 * 24 * 60 * 60;

function rememberRevocation(jti: string, expSeconds: number): void {
  if (revokedJtis.size >= REVOCATION_CACHE_MAX) {
    const now = Math.floor(Date.now() / 1000);
    for (const [k, exp] of revokedJtis) {
      if (exp <= now) revokedJtis.delete(k);
    }
    // Still full (all entries live): evict the oldest insertion. Reaching this
    // needs 50k logout-revocations inside one token lifetime, so simple FIFO is
    // enough; the DB stays authoritative and loadRevocations() rehydrates.
    if (revokedJtis.size >= REVOCATION_CACHE_MAX) {
      const oldest = revokedJtis.keys().next();
      if (!oldest.done) revokedJtis.delete(oldest.value);
    }
  }
  revokedJtis.set(jti, expSeconds);
}

export async function revokeSessionToken(jti: string, expSeconds: number): Promise<void> {
  rememberRevocation(jti, expSeconds);
  const { client } = await getDatabase();
  await client.execute({
    sql: 'INSERT OR REPLACE INTO revocations (jti, exp) VALUES (?, ?)',
    args: [jti, expSeconds],
  });
}

/**
 * Revoke a raw session token by its cookie value. Used by /api/auth/logout.
 *
 * The signature is checked first and the revocation is only recorded for
 * tokens that could actually authenticate: an already-invalid cookie needs no
 * deny-list entry, so a caller spamming forged logout requests cannot grow
 * the revocations table. Tokens without a jti (legacy mint) cannot be revoked
 * — nothing identifies them; the client-side cookie clear remains their only
 * logout, exactly as before this change. Returns true when a revocation entry
 * was written.
 */
export async function revokeSessionByToken(token: string): Promise<boolean> {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return false;
    const [encodedHeader, encodedPayload, signature] = parts;
    if (!constantTimeEquals(signature, hmac(`${encodedHeader}.${encodedPayload}`))) return false;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (typeof payload.jti !== 'string' || !payload.jti) return false;

    const now = Math.floor(Date.now() / 1000);
    // An already-expired (or malformed-exp) token fails verification on its
    // own; nothing to revoke.
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= now) {
      return false;
    }
    await revokeSessionToken(payload.jti, Math.min(payload.exp, now + REVOCATION_RETENTION_SECONDS));
    return true;
  } catch {
    return false;
  }
}

/**
 * Rehydrate the in-process revocation cache from the database (and GC rows
 * whose token has expired past its retention). Called from Next.js
 * instrumentation on server start and by tests that simulate a restart.
 */
export async function loadRevocations(opts?: { dbPath?: string }): Promise<number> {
  const { client } = await getDatabase(opts?.dbPath);
  const now = Math.floor(Date.now() / 1000);
  try {
    await client.execute({ sql: 'DELETE FROM revocations WHERE exp <= ?', args: [now] });
  } catch {
    // GC is opportunistic; a failure here must not block hydration.
  }
  const res = await client.execute({ sql: 'SELECT jti, exp FROM revocations', args: [] });
  for (const row of res.rows as any[]) {
    rememberRevocation(String(row.jti), Number(row.exp));
  }
  return res.rows.length;
}

/** Test-only: drop the in-process revocation cache for isolation between cases. */
export function clearRevocationCache(): void {
  revokedJtis.clear();
}

/**
 * Verify session JWT token
 */
export function verifySessionToken(token: string): AuthSessionUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    // Constant-time so a forged signature cannot be extended byte by byte.
    if (!constantTimeEquals(signature, hmac(`${encodedHeader}.${encodedPayload}`))) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    // Every token we mint carries an expiry (see signSessionToken / signAccessToken).
    // A missing or non-numeric exp would silently mean "never expires", so reject it.
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    // Revocation is additive: only tokens that carry a jti (every token minted
    // since T6) consult the deny list. Legacy jti-less tokens keep verifying
    // on signature + exp alone until the dual-read window closes.
    if (typeof payload.jti === 'string' && payload.jti && revokedJtis.has(payload.jti)) {
      return null;
    }

    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      picture: payload.picture || null,
      ...(payload.guest === true ? { guest: true } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Extract authenticated user from a NextRequest.
 * Accepts the browser cookie session and the device bearer token.
 */
export function getAuthenticatedUser(req: NextRequest): AuthSessionUser | null {
  const bearer = req.headers.get('authorization');
  if (bearer?.toLowerCase().startsWith('bearer ')) {
    return verifySessionToken(bearer.slice(7).trim());
  }
  const token = req.cookies.get('carbook_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Get dynamic OAuth Redirect URI based on request host
 */
export function getGoogleRedirectUri(req: NextRequest): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3070';
  const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}/api/auth/callback/google`;
}
