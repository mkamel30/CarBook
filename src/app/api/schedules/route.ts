import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { evaluateMaintenanceStatus } from '@/services/calculator';
import { DEFAULT_MAINTENANCE_PRESETS } from '@/services/presets';
import { getAuthenticatedUser } from '@/services/auth';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicleId');
    if (!vehicleId) {
      return NextResponse.json({ success: false, error: 'vehicleId is required' }, { status: 400 });
    }

    const user = getAuthenticatedUser(req);
    const repo = new StorageRepository();
    const vehicle = await repo.getVehicleById(vehicleId, user?.id);
    if (!vehicle) {
      return NextResponse.json({ success: false, error: 'Vehicle not found or unauthorized' }, { status: 404 });
    }

    let schedules = await repo.getSchedulesByVehicle(vehicleId);

    // If no schedules exist yet for this vehicle, initialize with default presets
    if (schedules.length === 0) {
      for (const preset of DEFAULT_MAINTENANCE_PRESETS) {
        await repo.addMaintenanceSchedule({
          vehicleId,
          itemCode: preset.itemCode,
          titleAr: preset.titleAr,
          titleEn: preset.titleEn,
          intervalKm: preset.intervalKm,
          intervalMonths: preset.intervalMonths,
          lastDoneOdometer: vehicle.initialOdometer,
          lastDoneDate: vehicle.createdAt ? vehicle.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
        });
      }
      schedules = await repo.getSchedulesByVehicle(vehicleId);
    }

    const evaluated = schedules.map(s => evaluateMaintenanceStatus(s, vehicle.currentOdometer));

    return NextResponse.json({
      success: true,
      data: {
        vehicle,
        schedules: evaluated,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, lastDoneOdometer, lastDoneDate, intervalKm, intervalMonths } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const repo = new StorageRepository();
    await repo.updateMaintenanceSchedule(id, {
      lastDoneOdometer: lastDoneOdometer !== undefined ? Number(lastDoneOdometer) : undefined,
      lastDoneDate: lastDoneDate !== undefined ? lastDoneDate : undefined,
      intervalKm: intervalKm !== undefined ? Number(intervalKm) : undefined,
      intervalMonths: intervalMonths !== undefined ? Number(intervalMonths) : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
