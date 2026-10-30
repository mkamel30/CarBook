import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { enrichFuelMetrics } from '@/services/calculator';
import { authErrorResponse, requireOwnership, requireUser } from '@/services/authz';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicleId');
    if (!vehicleId) {
      return NextResponse.json({ success: false, error: 'vehicleId is required' }, { status: 400 });
    }

    const user = requireUser(req);
    const repo = new StorageRepository();
    const vehicle = await repo.getVehicleById(vehicleId, user.id);
    if (!vehicle) {
      return NextResponse.json({ success: false, error: 'Vehicle not found or unauthorized' }, { status: 404 });
    }

    const rawLogs = await repo.getFuelLogsByVehicle(vehicleId);

    return NextResponse.json({ success: true, data: enrichFuelMetrics(rawLogs) });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const user = requireUser(req);
    const repo = new StorageRepository();
    await requireOwnership(repo, 'vehicles', body?.vehicleId, user.id);
    const log = await repo.addFuelLog(body);
    return NextResponse.json({ success: true, data: log });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;
    const user = requireUser(req);
    const repo = new StorageRepository();
    await requireOwnership(repo, 'fuel_logs', id, user.id);
    const updated = await repo.updateFuelLog(id, data);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const user = requireUser(req);
    const repo = new StorageRepository();
    await requireOwnership(repo, 'fuel_logs', id, user.id);
    await repo.deleteFuelLog(id!);
    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
