import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/services/auth';
import { runSync, type SyncRequest } from '@/persistence/sync';

export const runtime = 'nodejs';

// Two-way offline sync: client pushes its local changes and pulls everything
// that changed on the server since its cursor. Requires a signed-in user;
// guest/offline-claim upload is handled separately (see plan Phase 4).
export async function POST(req: NextRequest) {
  try {
    const user = getAuthenticatedUser(req);
    if (!user?.id) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = (await req.json()) as SyncRequest;
    if (!body || typeof body.deviceId !== 'string' || !body.deviceId) {
      return NextResponse.json({ success: false, error: 'deviceId is required' }, { status: 400 });
    }

    const result = await runSync(user.id, {
      deviceId: body.deviceId,
      since: Number(body.since) || 0,
      pushed: body.pushed || {},
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
