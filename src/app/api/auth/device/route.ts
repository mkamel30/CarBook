import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/services/auth';
import { linkGuestToUser, refreshDeviceSession, registerDevice, revokeDeviceSession } from '@/services/deviceAuth';

export const runtime = 'nodejs';

function bad(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

/** POST {deviceId} — first launch, or re-register after the keystore was wiped. */
export async function POST(req: NextRequest) {
  try {
    const { deviceId, refreshToken } = await req.json();

    if (refreshToken) {
      const session = await refreshDeviceSession(deviceId, refreshToken);
      return NextResponse.json({ success: true, data: session });
    }

    const session = await registerDevice(deviceId);
    return NextResponse.json({ success: true, data: session });
  } catch (err: any) {
    return bad(err.message);
  }
}

/**
 * POST {deviceId} while signed in as a real account — moves everything the
 * guest identity owns onto that account and reissues the device session.
 */
export async function PUT(req: NextRequest) {
  const user = getAuthenticatedUser(req);
  if (!user?.id || user.guest) {
    return NextResponse.json({ success: false, error: 'A signed-in, non-guest account is required' }, { status: 401 });
  }
  try {
    const { deviceId } = await req.json();
    const result = await linkGuestToUser(deviceId, user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return bad(err.message);
  }
}

/** DELETE ?sessionId= — sign one device out without touching the others. */
export async function DELETE(req: NextRequest) {
  const user = getAuthenticatedUser(req);
  if (!user?.id || user.guest) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }
  const sessionId = new URL(req.url).searchParams.get('sessionId');
  if (!sessionId) return bad('sessionId is required');

  await revokeDeviceSession(user.id, sessionId);
  return NextResponse.json({ success: true });
}
