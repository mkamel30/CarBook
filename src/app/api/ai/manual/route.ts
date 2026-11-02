import { NextRequest, NextResponse } from 'next/server';
import { getOrFetchVehicleManual } from '@/services/aiOrchestrator';
import { StorageRepository } from '@/persistence/repository';
import { authErrorResponse, requireUser } from '@/services/authz';
import { aiRateGuard } from '@/services/rateLimit';
import { mobilePreflight, withMobileCors } from '@/services/mobileCors';

async function POSTHandler(req: NextRequest) {
  try {
    // T6 abuse throttle: 10/min per user. Additive guard only — the auth and
    // ownership flow below is untouched.
    const limited = await aiRateGuard(req, 'manual');
    if (limited) return limited;

    const { vehicleId, forceRefresh } = await req.json();
    if (!vehicleId) {
      return NextResponse.json({ success: false, error: 'vehicleId is required' }, { status: 400 });
    }

    const user = requireUser(req);
    const repo = new StorageRepository();
    const vehicle = await repo.getVehicleById(vehicleId, user.id);
    if (!vehicle) {
      return NextResponse.json({ success: false, error: 'Vehicle not found' }, { status: 404 });
    }

    const { specs, source, fromCache } = await getOrFetchVehicleManual(
      vehicle.make,
      vehicle.model,
      vehicle.year,
      repo,
      vehicle.engineCc,
      Boolean(forceRefresh)
    );

    // Save permanently on the vehicle record as well
    await repo.updateVehicleSpecs(vehicleId, specs);

    return NextResponse.json({
      success: true,
      data: specs,
      meta: { source, fromCache },
    });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export const POST = withMobileCors(POSTHandler);
export const OPTIONS = mobilePreflight;
