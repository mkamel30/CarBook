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

  const { searchParams } = new URL(req.url);
  const userAgent = req.headers.get('user-agent') || '';
  const isAndroid = userAgent.includes('Android');
  const source = searchParams.get('source') || (isAndroid ? 'app' : 'web');
  const state = encodeURIComponent(JSON.stringify({ source }));

  const redirectUri = getGoogleRedirectUri(req);
  const scope = encodeURIComponent('openid email profile');
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${scope}&state=${state}&prompt=select_account&access_type=offline`;

  return NextResponse.redirect(googleAuthUrl);
}
