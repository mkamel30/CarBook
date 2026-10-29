import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.set('carbook_session', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return res;
}

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('carbook_session', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return res;
}
