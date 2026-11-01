import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/services/auth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  const proto =
    req.headers.get('x-forwarded-proto') ||
    (req.url.startsWith('https:') ? 'https' : 'http');

  const origin =
    process.env.APP_ORIGIN ||
    `${proto}://${
      req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3070'
    }`;

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
