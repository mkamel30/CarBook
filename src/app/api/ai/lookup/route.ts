import { NextRequest, NextResponse } from 'next/server';
import { getOrFetchVehicleSchedules } from '@/services/aiOrchestrator';
import { StorageRepository } from '@/persistence/repository';
import { authErrorResponse, requireUser } from '@/services/authz';
import { aiRateGuard } from '@/services/rateLimit';
import { withMobileCors } from '@/services/mobileCors';

async function POSTHandler(req: NextRequest) {
  try {
    // T6 abuse throttle: 10/min per user. Additive guard only — the auth and
    // ownership flow below is untouched.
    const limited = await aiRateGuard(req, 'lookup');
    if (limited) return limited;

    requireUser(req);
    const { make, model, year, engineCc, forceRefresh } = await req.json();
    if (!make || !model || !year) {
      return NextResponse.json({ success: false, error: 'Make, model, and year are required' }, { status: 400 });
    }

    const repo = new StorageRepository();
    const { proposal, source, fromCache } = await getOrFetchVehicleSchedules(
      make,
      model,
      Number(year),
      repo,
      engineCc,
      Boolean(forceRefresh)
    );

    return NextResponse.json({
      success: true,
      data: proposal,
      meta: { source, fromCache },
    });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export const POST = withMobileCors(POSTHandler);
