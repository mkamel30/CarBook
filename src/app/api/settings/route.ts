import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { resolveAiConfig } from '@/services/aiOrchestrator';
import { authErrorResponse, requireUser } from '@/services/authz';
import { getFuelPresetsByCountry } from '@/services/geoPricing';

export async function GET(req: NextRequest) {
  try {
    const user = requireUser(req);
    const repo = new StorageRepository();
    // aiConfig reflects this user's BYOK row when present (userId is additive;
    // without it resolveAiConfig behaves like the old global-only read).
    const aiConfig = await resolveAiConfig(repo, user.id);
    // Per-user settings first, legacy global row as fallback (see repository).
    const userApiKey = await repo.getSetting('ai_api_key', user.id);
    const fuelTypesRaw = await repo.getSetting('fuel_types', user.id);
    // Single source of truth: the official geoPricing country presets, so the
    // server fallback can never drift from the client defaults again.
    const defaultFuelTypes = getFuelPresetsByCountry('EG').fuelTypes;
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
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = requireUser(req);
    const { provider, apiKey, fuelTypes } = await req.json();
    const repo = new StorageRepository();

    if (provider) {
      // ai_provider stays a global setting: it is the legacy server-wide fallback
      // consumed by resolveAiConfig and existing tests; per-user rows would make
      // a global read (getSetting('ai_provider')) return null for everyone else.
      await repo.setSetting('ai_provider', provider);
    }
    if (apiKey !== undefined) {
      // Stored per user. NOTE: plaintext-at-rest in app_settings — is_encrypted is
      // deliberately false; nothing here encrypts, and claiming otherwise was cosmetic.
      await repo.setSetting('ai_api_key', apiKey, false, user.id);
    }
    if (fuelTypes !== undefined) {
      await repo.setSetting('fuel_types', JSON.stringify(fuelTypes), false, user.id);
    }

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
