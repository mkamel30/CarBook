import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';

export async function GET() {
  try {
    const repo = new StorageRepository();
    const vehicles = await repo.getAllVehicles();
    return NextResponse.json({ success: true, data: vehicles });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const repo = new StorageRepository();
    const vehicle = await repo.createVehicle(body);
    return NextResponse.json({ success: true, data: vehicle });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
