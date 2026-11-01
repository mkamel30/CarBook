import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { getAuthenticatedUser } from '@/services/auth';
import { authErrorResponse, requireOwnership, requireUser } from '@/services/authz';

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

export async function PUT(req: NextRequest) {
  try {
    const user = requireUser(req);
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Vehicle id is required' }, { status: 400 });
    }
    const repo = new StorageRepository();
    await requireOwnership(repo, 'vehicles', id, user.id);
    const updated = await repo.updateVehicle(id, data, user.id);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = requireUser(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Vehicle id is required' }, { status: 400 });
    }
    const repo = new StorageRepository();
    await requireOwnership(repo, 'vehicles', id, user.id);
    await repo.deleteVehicle(id, user.id);
    return NextResponse.json({ success: true, message: 'Vehicle deleted successfully' });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
