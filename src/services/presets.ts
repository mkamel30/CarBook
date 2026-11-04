export interface VehiclePresetItem {
  itemCode: string;
  titleAr: string;
  titleEn: string;
  intervalKm: number;
  intervalMonths?: number;
}

/**
 * Factory preventive-maintenance catalogue.
 *
 * Intervals follow common workshop/OEM conventions for petrol passenger cars
 * (whichever comes first: kilometres or months). They are user-facing labels the
 * owner can edit per vehicle through `PATCH /api/schedules` — they are not
 * medical/safety claims and never override the car's own manual.
 *
 * IMPORTANT: presets carry NO service baseline. A schedule row is seeded with
 * `last_done_odometer = NULL` / `last_done_date = NULL` so an item that was never
 * serviced reports `needs_record` ("service record required") instead of a
 * fabricated "serviced at the car's initial odometer" baseline.
 */
export const DEFAULT_MAINTENANCE_PRESETS: VehiclePresetItem[] = [
  {
    itemCode: 'engine_oil_filter',
    titleAr: 'تغيير زيت المحرك وفلتر الزيت',
    titleEn: 'Engine Oil & Filter Change',
    intervalKm: 10000,
    intervalMonths: 6,
  },
  {
    itemCode: 'air_filter',
    titleAr: 'تغيير فلتر الهواء',
    titleEn: 'Engine Air Filter Replacement',
    intervalKm: 20000,
    intervalMonths: 12,
  },
  {
    itemCode: 'cabin_ac_filter',
    titleAr: 'تغيير فلتر تكييف المقصورة',
    titleEn: 'Cabin AC Filter Replacement',
    intervalKm: 20000,
    intervalMonths: 12,
  },
  {
    itemCode: 'fuel_filter',
    titleAr: 'تغيير فلتر البنزين',
    titleEn: 'Fuel Filter Replacement',
    intervalKm: 30000,
    intervalMonths: 24,
  },
  {
    itemCode: 'spark_plugs',
    titleAr: 'فحص وتغيير شمعات الاحتراق (البوجيهات)',
    titleEn: 'Spark Plugs Replacement',
    intervalKm: 40000,
    intervalMonths: 24,
  },
  {
    itemCode: 'brake_pads',
    titleAr: 'فحص وتغيير تيل الفرامل الأمامي والخلفي',
    titleEn: 'Brake Pads & Shoes Inspection/Replacement',
    intervalKm: 30000,
    intervalMonths: 18,
  },
  {
    itemCode: 'brake_fluid',
    titleAr: 'تغيير سائل الفرامل وتنظيف الدائرة (DOT 4)',
    titleEn: 'Brake Fluid Flush & Bleed (DOT 4)',
    intervalKm: 40000,
    intervalMonths: 24,
  },
  {
    itemCode: 'transmission_oil',
    titleAr: 'تغيير زيت ناقل الحركة (الفتيس)',
    titleEn: 'Transmission Fluid (ATF/CVT) Replacement',
    intervalKm: 50000,
    intervalMonths: 36,
  },
  {
    itemCode: 'coolant',
    titleAr: 'تغيير سائل تبريد المحرك (مياه الردياتير)',
    titleEn: 'Engine Coolant Flush & Refill',
    intervalKm: 60000,
    intervalMonths: 36,
  },
  {
    itemCode: 'water_pump_hoses',
    titleAr: 'فحص وتغيير طرمبة المياه والخوريط (المسايل)',
    titleEn: 'Water Pump & Coolant Hose Inspection',
    intervalKm: 80000,
    intervalMonths: 48,
  },
  {
    itemCode: 'timing_belt',
    titleAr: 'تغيير سير الكاتينة (التايمنج) والمشد',
    titleEn: 'Timing Belt & Tensioner Replacement',
    intervalKm: 90000,
    intervalMonths: 60,
  },
  {
    itemCode: 'serpentine_belt',
    titleAr: 'فحص وتغيير سير الملحقات (الدينامو)',
    titleEn: 'Serpentine / Accessory Belt Inspection & Replacement',
    intervalKm: 60000,
    intervalMonths: 48,
  },
  {
    itemCode: 'tires_rotation',
    titleAr: 'تبديل وترصيص الإطارات وضبط الزوايا',
    titleEn: 'Tire Rotation & Wheel Alignment',
    intervalKm: 10000,
    intervalMonths: 6,
  },
];

/** Every factory item code, in catalogue order. */
export const FACTORY_ITEM_CODES: string[] = DEFAULT_MAINTENANCE_PRESETS.map(p => p.itemCode);

/** Prefix used for user-defined items so they can be told apart from factory ones. */
export const CUSTOM_ITEM_CODE_PREFIX = 'custom_';

export function isCustomItemCode(itemCode: string | null | undefined): boolean {
  return typeof itemCode === 'string' && itemCode.startsWith(CUSTOM_ITEM_CODE_PREFIX);
}

/**
 * Deterministic mapping from a recorded maintenance log's `service_type` to the
 * factory item codes that service evidences. Deliberately conservative: a
 * general inspection or an unplanned repair proves nothing about a specific
 * preventive item, so it maps to none — the log modal's explicit item selector
 * (`maint_linked_item_label`) is how the owner links those.
 */
export const SERVICE_TYPE_ITEM_CODES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  oil_change: Object.freeze(['engine_oil_filter']),
  periodic: Object.freeze(['engine_oil_filter', 'air_filter']),
  brakes: Object.freeze(['brake_pads']),
  tires: Object.freeze(['tires_rotation']),
  inspection: Object.freeze([]),
  repair: Object.freeze([]),
  other: Object.freeze([]),
});

/** Factory items a log of this service type automatically updates. */
export function derivedItemsForServiceType(serviceType: string | null | undefined): string[] {
  if (!serviceType) return [];
  return [...(SERVICE_TYPE_ITEM_CODES[serviceType] ?? [])];
}

/**
 * Item codes the vehicle does not have yet (compare on the raw code so a custom
 * `custom_…` code never shadows a factory one).
 */
export function missingFactoryPresets(existingItemCodes: Iterable<string>): VehiclePresetItem[] {
  const have = new Set(existingItemCodes);
  return DEFAULT_MAINTENANCE_PRESETS.filter(p => !have.has(p.itemCode));
}

export interface BaselineCandidate {
  odometer: number;
  serviceDate: string;
}

/**
 * Forward-only guard. A baseline may be established when it is missing, and may
 * only ever move to a HIGHER odometer: an older log (or a re-entered one) must
 * never rewind a newer record. Equal odometer only fills in a missing date.
 */
export function baselineMovesForward(
  current: { lastDoneOdometer?: number | null; lastDoneDate?: string | null },
  candidate: BaselineCandidate,
): boolean {
  const cur = current.lastDoneOdometer;
  if (cur === null || cur === undefined || !Number.isFinite(cur)) return true;
  if (!Number.isFinite(candidate.odometer)) return false;
  if (candidate.odometer > cur) return true;
  if (candidate.odometer < cur) return false;
  return !current.lastDoneDate && !!candidate.serviceDate;
}

/** The most recent live log that evidences this item, or null when none does. */
export function bestLogForItem<T extends { odometer: number; serviceDate: string; serviceType: string }>(
  logs: T[],
  itemCode: string,
): T | null {
  let best: T | null = null;
  for (const log of logs) {
    if (!derivedItemsForServiceType(log.serviceType).includes(itemCode)) continue;
    if (
      !best ||
      log.odometer > best.odometer ||
      (log.odometer === best.odometer && (log.serviceDate || '') > (best.serviceDate || ''))
    ) {
      best = log;
    }
  }
  return best;
}

export interface LinkedFromLog {
  date: string;
  odo: number;
}

/**
 * Honest "this baseline came from a service record" marker: the schedule's
 * baseline is exactly the odometer + date a live maintenance log carries. The
 * linker writes those two values together, so their joint presence is the
 * fingerprint — a hand-entered baseline that coincides with a real log at the
 * same day and reading is truthfully described as recorded, not fabricated.
 */
export function scheduleLinkedFromLog(
  schedule: { lastDoneOdometer?: number | null; lastDoneDate?: string | null },
  logs: Array<{ odometer: number; serviceDate: string }>,
): LinkedFromLog | null {
  const odo = schedule.lastDoneOdometer;
  const date = schedule.lastDoneDate;
  if (odo === null || odo === undefined || !date) return null;
  const match = logs.find(l => l.odometer === odo && l.serviceDate === date);
  return match ? { date, odo } : null;
}
