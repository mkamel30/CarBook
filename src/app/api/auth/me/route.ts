import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/services/auth';

export async function GET(req: NextRequest) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  return NextResponse.json({
    authenticated: true,
    user,
  });
}
