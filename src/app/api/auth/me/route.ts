import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/services/auth';
import { mobilePreflight, withMobileCors } from '@/services/mobileCors';

async function GETHandler(req: NextRequest) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  return NextResponse.json({
    authenticated: true,
    user,
  });
}

export const GET = withMobileCors(GETHandler);
export const OPTIONS = mobilePreflight;
