import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { getGoogleRedirectUri, signSessionToken } from '@/services/auth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const origin = req.nextUrl.origin;

  if (error || !code) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error || 'missing_code')}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?auth_error=server_credentials_missing`);
  }

  try {
    const redirectUri = getGoogleRedirectUri(req);

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
      return NextResponse.redirect(`${origin}/?auth_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from Google
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userinfoRes.ok) {
      return NextResponse.redirect(`${origin}/?auth_error=userinfo_failed`);
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

    // 4. Generate JWT session cookie
    const sessionToken = signSessionToken(user, 30);

    const response = NextResponse.redirect(`${origin}/`);
    response.cookies.set('carbook_session', sessionToken, {
      httpOnly: true,
      secure: false, // works on both http and https
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (err: any) {
    console.error('OAuth callback exception:', err);
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(err.message)}`);
  }
}
