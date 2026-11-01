import { NextRequest, NextResponse } from 'next/server';
import {
  detectCountryFromTimezone,
  getFuelPresetsByCountry,
  listSupportedCountries,
} from '@/services/geoPricing';
import { authErrorResponse, requireUser } from '@/services/authz';

export async function GET(req: NextRequest) {
  try {
    requireUser(req);
    const { searchParams } = new URL(req.url);
    const country = searchParams.get('country');
    const tz = searchParams.get('tz');

    let resolvedCountry = country;
    if (!resolvedCountry && tz) {
      resolvedCountry = detectCountryFromTimezone(tz);
    } else if (!resolvedCountry) {
      resolvedCountry = 'EG';
    }

    const preset = getFuelPresetsByCountry(resolvedCountry);
    const supportedCountries = listSupportedCountries();

    return NextResponse.json({
      success: true,
      data: {
        current: preset,
        supportedCountries,
      },
    });
  } catch (err: any) {
    const auth = authErrorResponse(err);
    if (auth) return auth;
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
