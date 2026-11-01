import { NextRequest, NextResponse } from 'next/server';
import { revokeSessionByToken } from '@/services/auth';

/**
 * Clear the session cookie and — for tokens minted with a `jti` (T6+) —
 * revoke the session server-side so the stolen or stale cookie value stops
 * working even if the client keeps it. Legacy jti-less tokens can only be
 * dropped client-side, exactly as before; they age out on their own exp and
 * the dual-read window ends no later than 2026-12-01.
 */
async function revokeAndBuild(res: NextResponse, req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get('carbook_session')?.value;
  if (token) {
    await revokeSessionByToken(token);
  }
  res.cookies.set('carbook_session', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return res;
}

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(`${req.nextUrl.origin}/`);
  return revokeAndBuild(res, req);
}

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ success: true });
  return revokeAndBuild(res, req);
}
