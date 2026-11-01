import { NextRequest, NextResponse } from 'next/server';
import { consultAiDoctor } from '@/services/aiOrchestrator';
import { StorageRepository } from '@/persistence/repository';
import { authErrorResponse, requireUser } from '@/services/authz';
import { aiRateGuard } from '@/services/rateLimit';

export async function POST(req: NextRequest) {
  try {
    // T6 abuse throttle: 10/min per user. Additive guard only — the auth and
    // ownership flow below is untouched.
    const limited = await aiRateGuard(req, 'doctor');
    if (limited) return limited;

    const { vehicleId, query } = await req.json();
    if (!vehicleId || !query) {
      return NextResponse.json({ success: false, error: 'vehicleId and query are required' }, { status: 400 });
    }

    const user = requireUser(req);
    const repo = new StorageRepository();
    const vehicle = await repo.getVehicleById(vehicleId, user.id);
    if (!vehicle) {
      return NextResponse.json({ success: false, error: 'Vehicle not found' }, { status: 404 });
    }

    const maintenanceLogs = await repo.getMaintenanceLogsByVehicle(vehicleId);

    const { advice, source } = await consultAiDoctor(
      {
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        engineCc: vehicle.engineCc,
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
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
