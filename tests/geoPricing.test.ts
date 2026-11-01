import { describe, it, expect } from 'vitest';
import {
  detectCountryFromTimezone,
  getFuelPresetsByCountry,
  listSupportedCountries,
  COUNTRY_FUEL_PRESETS,
} from '@/services/geoPricing';

describe('Geo Fuel Pricing & Location Presets', () => {
  it('detects Egypt from Cairo timezone', () => {
    expect(detectCountryFromTimezone('Africa/Cairo')).toBe('EG');
    expect(detectCountryFromTimezone('africa/cairo')).toBe('EG');
  });

  it('detects Saudi Arabia, UAE, Kuwait, Jordan and Poland from respective timezones', () => {
    expect(detectCountryFromTimezone('Asia/Riyadh')).toBe('SA');
    expect(detectCountryFromTimezone('Asia/Dubai')).toBe('AE');
    expect(detectCountryFromTimezone('Asia/Kuwait')).toBe('KW');
    expect(detectCountryFromTimezone('Asia/Amman')).toBe('JO');
    expect(detectCountryFromTimezone('Europe/Warsaw')).toBe('PL');
    expect(detectCountryFromTimezone('America/New_York')).toBe('US');
  });

  it('falls back safely to default region on unrecognized timezone', () => {
    expect(detectCountryFromTimezone('Unknown/Region')).toBe('EG');
    expect(detectCountryFromTimezone('')).toBe('EG');
  });

  it('returns valid fuel presets with real prices and positive values', () => {
    const egypt = getFuelPresetsByCountry('EG');
    expect(egypt.countryCode).toBe('EG');
    expect(egypt.currency).toBe('EGP');
    expect(egypt.fuelTypes.length).toBeGreaterThanOrEqual(4);
    for (const f of egypt.fuelTypes) {
      expect(f.price).toBeGreaterThan(0);
      expect(f.name).toBeTruthy();
    }

    const saudi = getFuelPresetsByCountry('SA');
    expect(saudi.countryCode).toBe('SA');
    expect(saudi.currency).toBe('SAR');
    expect(saudi.fuelTypes.some(f => f.name.includes('91'))).toBe(true);

    const uae = getFuelPresetsByCountry('AE');
    expect(uae.countryCode).toBe('AE');
    expect(uae.currency).toBe('AED');

    const poland = getFuelPresetsByCountry('PL');
    expect(poland.countryCode).toBe('PL');
    expect(poland.currency).toBe('PLN');
  });

  it('lists supported countries with flags and currencies', () => {
    const list = listSupportedCountries();
    expect(list.length).toBe(Object.keys(COUNTRY_FUEL_PRESETS).length);
    expect(list.some(c => c.countryCode === 'EG')).toBe(true);
    expect(list.some(c => c.countryCode === 'SA')).toBe(true);
    expect(list.some(c => c.countryCode === 'PL')).toBe(true);
  });
});
