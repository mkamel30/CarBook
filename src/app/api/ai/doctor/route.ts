import { NextRequest, NextResponse } from 'next/server';
import { consultAiDoctor } from '@/services/aiOrchestrator';
import { StorageRepository } from '@/persistence/repository';
import { getAuthenticatedUser } from '@/services/auth';

export async function POST(req: NextRequest) {
  try {
    const { vehicleId, query } = await req.json();
    if (!vehicleId || !query) {
      return NextResponse.json({ success: false, error: 'vehicleId and query are required' }, { status: 400 });
    }

    const user = getAuthenticatedUser(req);
    const repo = new StorageRepository();
    const vehicle = await repo.getVehicleById(vehicleId, user?.id);
    if (!vehicle) {
      return NextResponse.json({ success: false, error: 'Vehicle not found' }, { status: 404 });
    }

    const maintenanceLogs = await repo.getMaintenanceLogsByVehicle(vehicleId);

    const { advice, source } = await consultAiDoctor(
      {
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        currentOdometer: vehicle.currentOdometer,
      },
      query,
      maintenanceLogs,
      repo
    );

    return NextResponse.json({
      success: true,
      data: { advice },
      meta: { source },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
