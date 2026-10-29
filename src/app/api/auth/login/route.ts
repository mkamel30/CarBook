import { NextRequest, NextResponse } from 'next/server';
import { getGoogleRedirectUri } from '@/services/auth';

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID is not configured in server environment' },
      { status: 500 }
    );
  }

  const redirectUri = getGoogleRedirectUri(req);
  const scope = encodeURIComponent('openid email profile');
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${scope}&prompt=select_account&access_type=offline`;

  return NextResponse.redirect(googleAuthUrl);
}
