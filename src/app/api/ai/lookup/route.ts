import { NextRequest, NextResponse } from 'next/server';
import { getOrFetchVehicleSchedules } from '@/services/aiOrchestrator';
import { StorageRepository } from '@/persistence/repository';

export async function POST(req: NextRequest) {
  try {
    const { make, model, year } = await req.json();
    if (!make || !model || !year) {
      return NextResponse.json({ success: false, error: 'Make, model, and year are required' }, { status: 400 });
    }

    const repo = new StorageRepository();
    const { proposal, source, fromCache } = await getOrFetchVehicleSchedules(
      make,
      model,
      Number(year),
      repo
    );

    return NextResponse.json({
      success: true,
      data: proposal,
      meta: { source, fromCache },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
