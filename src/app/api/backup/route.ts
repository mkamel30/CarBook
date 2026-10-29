import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/services/auth';
import { createBackup, parseBackup, restoreBackup, type RestoreMode } from '@/services/backup';

export const runtime = 'nodejs';

const MODES: RestoreMode[] = ['merge', 'replace'];

export async function GET(req: NextRequest) {
  try {
    const user = getAuthenticatedUser(req);
    if (!user?.id) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const backup = await createBackup(user.id);
    const stamp = backup.exportedAt.slice(0, 10);
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="carbook-backup-${stamp}.json"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getAuthenticatedUser(req);
    if (!user?.id) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const mode = (body?.mode ?? 'merge') as RestoreMode;
    if (!MODES.includes(mode)) {
      return NextResponse.json({ success: false, error: `mode must be one of ${MODES.join(', ')}` }, { status: 400 });
    }

    const report = await restoreBackup(parseBackup(body?.file), user.id, mode);
    return NextResponse.json({ success: true, data: report });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
