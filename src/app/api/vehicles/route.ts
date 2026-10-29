import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { getAuthenticatedUser } from '@/services/auth';

export async function GET(req: NextRequest) {
  try {
    const user = getAuthenticatedUser(req);
    const repo = new StorageRepository();
    // If user is authenticated, isolate to their vehicles.
    // If not authenticated, return vehicles only if no users exist in the system (initial setup).
    const vehicles = await repo.getAllVehicles(user?.id);
    return NextResponse.json({ success: true, data: vehicles });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getAuthenticatedUser(req);
    const body = await req.json();
    const repo = new StorageRepository();
    const vehicle = await repo.createVehicle(body, user?.id);
    return NextResponse.json({ success: true, data: vehicle });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
