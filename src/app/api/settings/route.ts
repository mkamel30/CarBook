import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { resolveAiConfig } from '@/services/aiOrchestrator';

export async function GET() {
  try {
    const repo = new StorageRepository();
    const aiConfig = await resolveAiConfig(repo);
    const userApiKey = await repo.getSetting('ai_api_key');
    const fuelTypesRaw = await repo.getSetting('fuel_types');
    const defaultFuelTypes = [
      { id: 'gasoline_92', name: 'بنزين 92', price: 15.25 },
      { id: 'gasoline_95', name: 'بنزين 95', price: 17.00 },
      { id: 'gasoline_80', name: 'بنزين 80', price: 13.75 },
      { id: 'diesel', name: 'سولار', price: 13.50 },
      { id: 'cng', name: 'غاز طبيعي', price: 7.00 },
    ];
    const fuelTypes = fuelTypesRaw ? JSON.parse(fuelTypesRaw) : defaultFuelTypes;

    return NextResponse.json({
      success: true,
      data: {
        provider: aiConfig.provider,
        hasApiKey: Boolean(userApiKey),
        maskedApiKey: userApiKey ? `${userApiKey.slice(0, 4)}...${userApiKey.slice(-4)}` : null,
        isServerManaged: aiConfig.isServerManaged,
        hasServerKey: aiConfig.hasKey && aiConfig.isServerManaged,
        isAiReady: true,
        fuelTypes,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey, fuelTypes } = await req.json();
    const repo = new StorageRepository();

    if (provider) {
      await repo.setSetting('ai_provider', provider);
    }
    if (apiKey !== undefined) {
      await repo.setSetting('ai_api_key', apiKey, true);
    }
    if (fuelTypes !== undefined) {
      await repo.setSetting('fuel_types', JSON.stringify(fuelTypes));
    }

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
