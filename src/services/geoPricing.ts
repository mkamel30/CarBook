export interface FuelTypeItem {
  id: string;
  name: string;
  price: number;
}

export interface CountryFuelPreset {
  countryCode: string;
  nameEn: string;
  nameAr: string;
  currency: string;
  currencySymbol: string;
  flag: string;
  fuelTypes: FuelTypeItem[];
}

export const COUNTRY_FUEL_PRESETS: Record<string, CountryFuelPreset> = {
  EG: {
    countryCode: 'EG',
    nameEn: 'Egypt',
    nameAr: 'مصر',
    currency: 'EGP',
    currencySymbol: 'ج.م',
    flag: '🇪🇬',
    fuelTypes: [
      { id: 'gasoline_92', name: 'بنزين 92', price: 15.25 },
      { id: 'gasoline_95', name: 'بنزين 95', price: 17.00 },
      { id: 'gasoline_80', name: 'بنزين 80', price: 13.75 },
      { id: 'diesel', name: 'سولار', price: 13.50 },
      { id: 'cng', name: 'غاز طبيعي', price: 7.00 },
    ],
  },
  SA: {
    countryCode: 'SA',
    nameEn: 'Saudi Arabia',
    nameAr: 'المملكة العربية السعودية',
    currency: 'SAR',
    currencySymbol: 'ر.س',
    flag: '🇸🇦',
    fuelTypes: [
      { id: 'gasoline_91', name: 'بنزين 91', price: 2.18 },
      { id: 'gasoline_95', name: 'بنزين 95', price: 2.33 },
      { id: 'diesel', name: 'ديزل', price: 1.15 },
    ],
  },
  AE: {
    countryCode: 'AE',
    nameEn: 'United Arab Emirates',
    nameAr: 'الإمارات العربية المتحدة',
    currency: 'AED',
    currencySymbol: 'د.إ',
    flag: '🇦🇪',
    fuelTypes: [
      { id: 'special_95', name: 'بنزين خصوصي 95', price: 2.54 },
      { id: 'super_98', name: 'بنزين ممتاز 98', price: 2.66 },
      { id: 'diesel', name: 'ديزل', price: 2.60 },
    ],
  },
  KW: {
    countryCode: 'KW',
    nameEn: 'Kuwait',
    nameAr: 'الكويت',
    currency: 'KWD',
    currencySymbol: 'د.ك',
    flag: '🇰🇼',
    fuelTypes: [
      { id: 'premium_91', name: 'بنزين ممتاز 91', price: 0.085 },
      { id: 'super_95', name: 'بنزين خصوصي 95', price: 0.105 },
      { id: 'ultra_98', name: 'بنزين ألترا 98', price: 0.200 },
      { id: 'diesel', name: 'ديزل', price: 0.115 },
    ],
  },
  QA: {
    countryCode: 'QA',
    nameEn: 'Qatar',
    nameAr: 'قطر',
    currency: 'QAR',
    currencySymbol: 'ر.ق',
    flag: '🇶🇦',
    fuelTypes: [
      { id: 'gasoline_91', name: 'بنزين ممتاز 91', price: 1.95 },
      { id: 'gasoline_95', name: 'بنزين سوبر 95', price: 2.10 },
      { id: 'diesel', name: 'ديزل', price: 2.05 },
    ],
  },
  OM: {
    countryCode: 'OM',
    nameEn: 'Oman',
    nameAr: 'عُمان',
    currency: 'OMR',
    currencySymbol: 'ر.ع',
    flag: '🇴🇲',
    fuelTypes: [
      { id: 'm91', name: 'بنزين م91', price: 0.229 },
      { id: 'm95', name: 'بنزين م95', price: 0.239 },
      { id: 'diesel', name: 'ديزل', price: 0.258 },
    ],
  },
  BH: {
    countryCode: 'BH',
    nameEn: 'Bahrain',
    nameAr: 'البحرين',
    currency: 'BHD',
    currencySymbol: 'د.ب',
    flag: '🇧🇭',
    fuelTypes: [
      { id: 'jayyid_91', name: 'بنزين جيد 91', price: 0.140 },
      { id: 'mumtaz_95', name: 'بنزين ممتاز 95', price: 0.200 },
      { id: 'diesel', name: 'ديزل', price: 0.180 },
    ],
  },
  JO: {
    countryCode: 'JO',
    nameEn: 'Jordan',
    nameAr: 'الأردن',
    currency: 'JOD',
    currencySymbol: 'د.أ',
    flag: '🇯🇴',
    fuelTypes: [
      { id: 'octane_90', name: 'بنزين أوكتان 90', price: 0.860 },
      { id: 'octane_95', name: 'بنزين أوكتان 95', price: 1.100 },
      { id: 'diesel', name: 'ديزل', price: 0.655 },
    ],
  },
  PL: {
    countryCode: 'PL',
    nameEn: 'Poland',
    nameAr: 'بولندا',
    currency: 'PLN',
    currencySymbol: 'zł',
    flag: '🇵🇱',
    fuelTypes: [
      { id: 'pb95', name: 'Benzyna Pb95', price: 6.25 },
      { id: 'pb98', name: 'Benzyna Pb98', price: 6.80 },
      { id: 'on_diesel', name: 'Olej Napędowy (ON)', price: 6.30 },
      { id: 'lpg', name: 'Autogaz (LPG)', price: 2.95 },
    ],
  },
  US: {
    countryCode: 'US',
    nameEn: 'United States (Global)',
    nameAr: 'الولايات المتحدة (دولي)',
    currency: 'USD',
    currencySymbol: '$',
    flag: '🇺🇸',
    fuelTypes: [
      { id: 'regular_87', name: 'Regular 87 Octane', price: 3.25 },
      { id: 'midgrade_89', name: 'Midgrade 89 Octane', price: 3.65 },
      { id: 'premium_93', name: 'Premium 93 Octane', price: 4.05 },
      { id: 'diesel', name: 'Diesel', price: 3.75 },
    ],
  },
};

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  'africa/cairo': 'EG',
  'asia/riyadh': 'SA',
  'asia/dubai': 'AE',
  'asia/kuwait': 'KW',
  'asia/qatar': 'QA',
  'asia/muscat': 'OM',
  'asia/bahrain': 'BH',
  'asia/amman': 'JO',
  'europe/warsaw': 'PL',
  'america/new_york': 'US',
  'america/chicago': 'US',
  'america/denver': 'US',
  'america/los_angeles': 'US',
};

/**
 * Detect country code from IANA timezone string or browser environment
 */
export function detectCountryFromTimezone(tz?: string): string {
  const targetTz = (tz || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''))
    .toLowerCase()
    .trim();

  if (TIMEZONE_TO_COUNTRY[targetTz]) {
    return TIMEZONE_TO_COUNTRY[targetTz];
  }

  // Broad prefix matching
  if (targetTz.includes('cairo')) return 'EG';
  if (targetTz.includes('riyadh')) return 'SA';
  if (targetTz.includes('dubai')) return 'AE';
  if (targetTz.includes('kuwait')) return 'KW';
  if (targetTz.includes('qatar')) return 'QA';
  if (targetTz.includes('muscat')) return 'OM';
  if (targetTz.includes('bahrain')) return 'BH';
  if (targetTz.includes('amman')) return 'JO';
  if (targetTz.includes('warsaw')) return 'PL';
  if (targetTz.startsWith('america/')) return 'US';

  // Default to Egypt as primary region, or US fallback
  return 'EG';
}

/**
 * Get fuel presets for a specific country
 */
export function getFuelPresetsByCountry(countryCode: string): CountryFuelPreset {
  const upper = (countryCode || 'EG').toUpperCase();
  return COUNTRY_FUEL_PRESETS[upper] || COUNTRY_FUEL_PRESETS['EG'];
}

/**
 * List all available supported countries for selection
 */
export function listSupportedCountries(): CountryFuelPreset[] {
  return Object.values(COUNTRY_FUEL_PRESETS);
}
