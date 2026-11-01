import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import {
  OAUTH_NONCE_COOKIE,
  WEB_SESSION_TTL_DAYS,
  clearOAuthNonceCookie,
  constantTimeEquals,
  getGoogleRedirectUri,
  signSessionToken,
} from '@/services/auth';
import { issueOneTimeCode } from '@/services/deviceAuth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const stateParam = searchParams.get('state');

  const origin = process.env.APP_ORIGIN
    || `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3070'}`;

  // --- OAuth state CSRF gate (always enforced for app and web alike) ---
  // /api/auth/login mirrored a random nonce both into a short-lived httpOnly
  // cookie and inside the JSON state handed to Google. A callback only passes if
  // the state's nonce equals the cookie's, so an attacker cannot trick a signed-in
  // browser into completing a login with an attacker-chosen Google account.
  const cookieNonce = req.cookies.get(OAUTH_NONCE_COOKIE)?.value;

  let state: { source?: string; nonce?: string } | null = null;
  if (stateParam) {
    try {
      state = JSON.parse(stateParam);
    } catch {
      try {
        state = JSON.parse(decodeURIComponent(stateParam));
      } catch {
        state = null;
      }
    }
  }

  const nonceOk =
    !!state &&
    typeof state.nonce === 'string' &&
    typeof cookieNonce === 'string' &&
    constantTimeEquals(state.nonce, cookieNonce);

  if (!nonceOk) {
    // Missing cookie, missing state, or mismatch: reject and burn the cookie.
    const reject = NextResponse.json(
      { error: 'invalid_oauth_state' },
      { status: 400 }
    );
    clearOAuthNonceCookie(reject);
    return reject;
  }

  const isApp = state?.source === 'app' || !!req.headers.get('user-agent')?.includes('Android');

  if (error || !code) {
    const reject = NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error || 'missing_code')}`);
    clearOAuthNonceCookie(reject);
    return reject;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const reject = NextResponse.redirect(`${origin}/?auth_error=server_credentials_missing`);
    clearOAuthNonceCookie(reject);
    return reject;
  }

  try {
    const redirectUri = getGoogleRedirectUri(req);

    // The state has been consumed and validated above, so every exit below burns
    // the nonce cookie to stop a replay of this callback.

    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Google token exchange error:', errBody);
      const failure = NextResponse.redirect(`${origin}/?auth_error=token_exchange_failed`);
      clearOAuthNonceCookie(failure);
      return failure;
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from Google
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userinfoRes.ok) {
      const failure = NextResponse.redirect(`${origin}/?auth_error=userinfo_failed`);
      clearOAuthNonceCookie(failure);
      return failure;
    }

    const profile = await userinfoRes.json();
    // profile contains: sub (id), email, name, picture

    // 3. Persist or update user in SQLite & auto-claim legacy records
    const repo = new StorageRepository();
    const user = await repo.findOrCreateUser({
      id: profile.sub,
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      picture: profile.picture || null,
    });

    // Check if authentication was initiated from mobile app or Android device
    if (isApp) {
      // Deep-link handoff: never put a durable session token in the URL. Mint a
      // single-use, short-lived authorization code and redirect to the App Link
      // target: a verified install hands the URL straight to MainActivity (the
      // browser renders nothing); an unverified install gets the tap-to-open
      // page at /app-login instead.
      const handoffCode = await issueOneTimeCode(user.id);
      const appResponse = NextResponse.redirect(
        `${origin}/app-login?code=${encodeURIComponent(handoffCode)}`,
      );
      clearOAuthNonceCookie(appResponse);
      return appResponse;
    }

    // 4. Web flow: mint the session cookie directly (a cookie, never a URL token).
    // T6: default 7-day TTL with a jti so logout can revoke the session
    // server-side, replacing the old 30-day irreversible cookie.
    const sessionToken = signSessionToken(user);

    const webResponse = NextResponse.redirect(`${origin}/`);
    webResponse.cookies.set('carbook_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: WEB_SESSION_TTL_DAYS * 24 * 60 * 60,
    });
    clearOAuthNonceCookie(webResponse);
    return webResponse;
  } catch (err: any) {
    console.error('OAuth callback exception:', err);
    const failure = NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(err.message)}`);
    clearOAuthNonceCookie(failure);
    return failure;
  }
}
