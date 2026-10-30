import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { getAuthenticatedUser } from '@/services/auth';
import { authErrorResponse, requireUser } from '@/services/authz';

export async function GET(req: NextRequest) {
  try {
    const user = getAuthenticatedUser(req);
    const repo = new StorageRepository();
    // Anonymous callers get an empty list rather than the unassigned legacy rows.
    const vehicles = await repo.getAllVehicles(user?.id);
    return NextResponse.json({ success: true, data: vehicles });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = requireUser(req);
    const body = await req.json();
    const repo = new StorageRepository();
    const vehicle = await repo.createVehicle(body, user.id);
    return NextResponse.json({ success: true, data: vehicle });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
