import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicleId');
    if (!vehicleId) {
      return NextResponse.json({ success: false, error: 'vehicleId is required' }, { status: 400 });
    }

    const repo = new StorageRepository();
    const logs = await repo.getMaintenanceLogsByVehicle(vehicleId);
    return NextResponse.json({ success: true, data: logs });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const repo = new StorageRepository();
    const log = await repo.addMaintenanceLog(body);
    return NextResponse.json({ success: true, data: log });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
