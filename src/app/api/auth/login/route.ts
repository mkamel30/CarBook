import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getGoogleRedirectUri, setOAuthNonceCookie } from '@/services/auth';
import { buildRateLimitResponse, getClientIp, loginLimiter } from '@/services/rateLimit';

export async function GET(req: NextRequest) {
  // In-route abuse throttle (T6): 10 handoff starts per minute per IP. Not
  // global middleware — this route alone opts in, before any work is done.
  const limited = await loginLimiter.check(getClientIp(req));
  if (!limited.allowed) return buildRateLimitResponse(limited);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID is not configured in server environment' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const userAgent = req.headers.get('user-agent') || '';
  const isAndroid = userAgent.includes('Android');
  const source = searchParams.get('source') || (isAndroid ? 'app' : 'web');

  // Cryptographically random nonce, mirrored in a httpOnly cookie and inside the
  // opaque state handed to Google. The callback requires both to match, so a
  // forged or replayed state (attacker-supplied `state` with no cookie, or a
  // cookie from another session) cannot complete a login. Enforced for app and
  // web alike: both enter through this same redirect.
  const nonce = crypto.randomBytes(32).toString('base64url');
  const state = encodeURIComponent(JSON.stringify({ source, nonce }));

  const redirectUri = getGoogleRedirectUri(req);
  const scope = encodeURIComponent('openid email profile');
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${scope}&state=${state}&prompt=select_account&access_type=offline`;

  const response = NextResponse.redirect(googleAuthUrl);
  setOAuthNonceCookie(response, nonce);

  return response;
}
