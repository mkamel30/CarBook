import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';

export async function GET() {
  try {
    const repo = new StorageRepository();
    const apiKey = await repo.getSetting('ai_api_key');
    const provider = await repo.getSetting('ai_provider') || 'gemini';

    return NextResponse.json({
      success: true,
      data: {
        provider,
        hasApiKey: Boolean(apiKey),
        maskedApiKey: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : null,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey } = await req.json();
    const repo = new StorageRepository();

    if (provider) {
      await repo.setSetting('ai_provider', provider);
    }
    if (apiKey !== undefined) {
      await repo.setSetting('ai_api_key', apiKey, true);
    }

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
