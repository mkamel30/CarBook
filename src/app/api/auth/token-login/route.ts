import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { signSessionToken, verifySessionToken, WEB_SESSION_TTL_DAYS } from '@/services/auth';
import { isGuestUserId, redeemOneTimeCode } from '@/services/deviceAuth';
import { buildRateLimitResponse, getClientIp, tokenLoginLimiter } from '@/services/rateLimit';
import { withMobileCors } from '@/services/mobileCors';

function reject401(reason: string) {
  return NextResponse.json({ success: false, error: reason }, { status: 401 });
}

/**
 * Redeem a one-time handoff code and return its owner.
 *
 * Shared by the GET redirect flow (cookie into a WebView jar) and the POST JSON
 * flow (bearer bridge) so BOTH use the identical atomic single-use path — one
 * code can never be spent once per transport. Returns a machine-readable reason
 * so the two callers can each render the failure their own way.
 */
type Redeemed =
  | { ok: true; account: { id: string; email: string; name: string; picture: string | null } }
  | { ok: false; reason: string };

async function redeem(code: string | null | undefined): Promise<Redeemed> {
  if (typeof code !== 'string' || !code) return { ok: false, reason: 'missing_code' };

  const userId = await redeemOneTimeCode(code);
  // Unknown, already spent, or expired -> indistinguishable 401 so codes are
  // not enumerable and a replay never mints a second session.
  if (!userId) return { ok: false, reason: 'invalid_code' };

  const repo = new StorageRepository();
  const account = await repo.getUserById(userId);
  if (!account) return { ok: false, reason: 'unknown_user' };
  // Codes are only minted from a completed Google login, so the owner must be a
  // real account. Cheap defence in depth: a guest id must never buy a durable
  // bearer, whatever minted the row.
  if (isGuestUserId(account.id)) return { ok: false, reason: 'guest_account' };

  return { ok: true, account };
}

/** Hosts that can legitimately serve plaintext: loopback dev/test only. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * True when the durable bearer may be handed out at all.
 *
 * A 7-day session JWT in a JSON body is only worth less than a cookie if it
 * travels over an encrypted channel: on plain HTTP any on-path reader captures
 * it and the revocation work is moot. So refuse cleartext for every real host,
 * and allow it solely on loopback where the "network" is this machine (dev
 * server, vitest). `x-forwarded-proto` is what the TLS terminator (Caddy/nginx)
 * reports for the client-visible scheme.
 */
function isSecureChannel(req: NextRequest): boolean {
  const { protocol, hostname } = new URL(req.url);
  const forwarded = req.headers.get('x-forwarded-proto');
  const scheme = (forwarded ? forwarded.split(',')[0].trim() : protocol.replace(/:$/, ''))
    .toLowerCase();
  if (scheme === 'https') return true;
  return LOOPBACK_HOSTS.has(hostname);
}

async function GETHandler(req: NextRequest) {
  // In-route abuse throttle (T6): 10 redemptions per minute per IP, before
  // any code/token work. Bounds both code-guessing spam and legacy token replay.
  const limited = await tokenLoginLimiter.check(getClientIp(req));
  if (!limited.allowed) return buildRateLimitResponse(limited);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  const proto =
    req.headers.get('x-forwarded-proto') ||
    (req.url.startsWith('https:') ? 'https' : 'http');

  const origin =
    process.env.APP_ORIGIN ||
    `${proto}://${
      req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3070'
    }`;

  // ---------------------------------------------------------------------------
  // Primary path: single-use authorization code (no durable token in any URL).
  // ---------------------------------------------------------------------------
  if (code) {
    const redeemed = await redeem(code);
    if (!redeemed.ok) return reject401(redeemed.reason);
    const account = redeemed.account;

    // Codes are only minted from a completed Google login, so the owner is always
    // a real (non-guest) account. New mint = 7-day TTL + jti (revocable); the
    // legacy branch below still accepts pre-T6 30-day tokens until the window
    // closes.
    const sessionToken = signSessionToken(account);

    // Set the cookie directly in the WebView's cookie jar, then hand off to the app.
    const response = NextResponse.redirect(`${origin}/`);
    response.cookies.set('carbook_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: WEB_SESSION_TTL_DAYS * 24 * 60 * 60,
    });
    return response;
  }

  // ---------------------------------------------------------------------------
  // LEGACY TRANSITION (dual-read, remove no earlier than 2026-12-01):
  // Older installed APKs complete OAuth with `carbook://login?token=<30-day JWT>`
  // and forward it here. We keep accepting the old `?token=` param so users
  // mid-upgrade are not stranded, but the callback no longer mints a token into
  // the URL for new installs. After the 30-day window this whole branch goes away.
  // ---------------------------------------------------------------------------
  const token = searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_token`);
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return NextResponse.redirect(`${origin}/?auth_error=invalid_token`);
  }

  // Set the cookie directly in the WebView's cookie jar
  const response = NextResponse.redirect(`${origin}/`);
  response.cookies.set('carbook_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  return response;
}

// -----------------------------------------------------------------------------
// Bearer handoff for the BUNDLED app (task #17).
//
// The shipped APK is served from the local `https://localhost` Capacitor scheme,
// so its cross-origin `fetch` to this server can never carry the SameSite=lax
// `carbook_session` cookie: the WebView cookie jar belongs to the SERVER origin
// while the app runs on the local origin, and a cross-origin fetch with
// credentials is refused regardless. Login/sync-to-account was therefore broken
// end to end. This endpoint returns the same durable session JWT as a JSON body
// instead of a cookie, so the app can present it as `Authorization: Bearer …` —
// verified by the identical verifySessionToken path, jti revocation included
// (see services/authz.ts requireUser and services/auth.ts getAuthenticatedUser).
//
// Contract: POST {code} -> 200 {success, token, user} | 401 {success:false,error}
//   * the code is spent through the exact same atomic single-use redemption the
//     GET redirect uses, so a POST replay is rejected just like a GET replay;
//   * https-only: over cleartext the JWT would be capturable in flight, so real
//     hosts get an explicit 403 instead of a silently weaker session;
//   * no cookie, no logging: the token appears in exactly one place — this
//     response body — and `Cache-Control: no-store` stops any proxy caching it.
// -----------------------------------------------------------------------------
async function POSTHandler(req: NextRequest) {
  const limited = await tokenLoginLimiter.check(getClientIp(req));
  if (!limited.allowed) return buildRateLimitResponse(limited);

  if (!isSecureChannel(req)) {
    return NextResponse.json({ success: false, error: 'insecure_transport' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    // A malformed body is treated like a missing code: same shape, no detail leak.
    return reject401('missing_code');
  }

  const code = typeof body?.code === 'string' ? body.code.trim() : null;
  const redeemed = await redeem(code);
  if (!redeemed.ok) return reject401(redeemed.reason);

  const sessionToken = signSessionToken(redeemed.account);

  return NextResponse.json(
    {
      success: true,
      token: sessionToken,
      user: {
        id: redeemed.account.id,
        email: redeemed.account.email,
        name: redeemed.account.name,
        picture: redeemed.account.picture,
      },
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withMobileCors(GETHandler);
export const POST = withMobileCors(POSTHandler);

