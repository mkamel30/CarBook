import { NextRequest, NextResponse } from 'next/server';
import { lookupFullVehicleManual } from '@/services/ai';
import { StorageRepository } from '@/persistence/repository';

export async function POST(req: NextRequest) {
  try {
    const { vehicleId } = await req.json();
    if (!vehicleId) {
      return NextResponse.json({ success: false, error: 'vehicleId is required' }, { status: 400 });
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

    const specs = await lookupFullVehicleManual(vehicle.make, vehicle.model, vehicle.year, {
      apiKey,
      provider,
    });

    // Save permanently in SQLite
    await repo.updateVehicleSpecs(vehicleId, specs);

    return NextResponse.json({ success: true, data: specs });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
