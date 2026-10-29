import { NextRequest, NextResponse } from 'next/server';
import { getOrFetchVehicleManual } from '@/services/aiOrchestrator';
import { StorageRepository } from '@/persistence/repository';
import { getAuthenticatedUser } from '@/services/auth';

export async function POST(req: NextRequest) {
  try {
    const { vehicleId } = await req.json();
    if (!vehicleId) {
      return NextResponse.json({ success: false, error: 'vehicleId is required' }, { status: 400 });
    }

    const user = getAuthenticatedUser(req);
    const repo = new StorageRepository();
    const vehicle = await repo.getVehicleById(vehicleId, user?.id);
    if (!vehicle) {
      return NextResponse.json({ success: false, error: 'Vehicle not found' }, { status: 404 });
    }

    const { specs, source, fromCache } = await getOrFetchVehicleManual(
      vehicle.make,
      vehicle.model,
      vehicle.year,
      repo
    );

    // Save permanently on the vehicle record as well
    await repo.updateVehicleSpecs(vehicleId, specs);

    return NextResponse.json({
      success: true,
      data: specs,
      meta: { source, fromCache },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
