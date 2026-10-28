import { NextRequest, NextResponse } from 'next/server';
import { lookupVehicleScheduleProposal } from '@/services/ai';
import { StorageRepository } from '@/persistence/repository';

export async function POST(req: NextRequest) {
  try {
    const { make, model, year } = await req.json();
    if (!make || !model || !year) {
      return NextResponse.json({ success: false, error: 'Make, model, and year are required' }, { status: 400 });
    }

    const repo = new StorageRepository();
    const apiKey = await repo.getSetting('ai_api_key');
    const provider = (await repo.getSetting('ai_provider')) as 'gemini' | 'openrouter' || 'gemini';

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'AI API key is not configured. Please enter your API key in Settings first.',
        isKeyMissing: true,
      }, { status: 400 });
    }

    const proposal = await lookupVehicleScheduleProposal(make, model, Number(year), {
      apiKey,
      provider,
    });

    return NextResponse.json({ success: true, data: proposal });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
