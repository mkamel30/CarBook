import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { signSessionToken, verifySessionToken, WEB_SESSION_TTL_DAYS } from '@/services/auth';
import { redeemOneTimeCode } from '@/services/deviceAuth';
import { buildRateLimitResponse, getClientIp, tokenLoginLimiter } from '@/services/rateLimit';

function reject401(reason: string) {
  return NextResponse.json({ success: false, error: reason }, { status: 401 });
}

export async function GET(req: NextRequest) {
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
    const userId = await redeemOneTimeCode(code);
    // Unknown, already spent, or expired -> indistinguishable 401 so codes are
    // not enumerable and a replay never mints a second session.
    if (!userId) return reject401('invalid_code');

    const repo = new StorageRepository();
    const account = await repo.getUserById(userId);
    if (!account) return reject401('unknown_user');

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
