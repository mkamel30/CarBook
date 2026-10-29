import { NextRequest, NextResponse } from 'next/server';
import { askAiCarDoctor } from '@/services/ai';
import { StorageRepository } from '@/persistence/repository';

export async function POST(req: NextRequest) {
  try {
    const { vehicleId, query } = await req.json();
    if (!vehicleId || !query) {
      return NextResponse.json({ success: false, error: 'vehicleId and query are required' }, { status: 400 });
    }

    const repo = new StorageRepository();
    const vehicle = await repo.getVehicleById(vehicleId);
    if (!vehicle) {
      return NextResponse.json({ success: false, error: 'Vehicle not found' }, { status: 404 });
    }

    const apiKey = await repo.getSetting('ai_api_key');
    const provider = (await repo.getSetting('ai_provider')) as 'gemini' | 'openrouter' || 'gemini';

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'AI API key is not configured. Please enter your API key in Settings first.',
        isKeyMissing: true,
      }, { status: 400 });
    }

    const maintenanceLogs = await repo.getMaintenanceLogsByVehicle(vehicleId);

    const advice = await askAiCarDoctor(
      {
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        currentOdometer: vehicle.currentOdometer,
      },
      query,
      maintenanceLogs,
      { apiKey, provider }
    );

    return NextResponse.json({ success: true, data: { advice } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
