// Device-row <-> server-shape mapping for the offline bridge.
//
// The device owns WatermelonDB rows whose columns are the sync-contract keys
// (see @device/schema). The server's route handlers return objects run through
// the domain Zod schemas — camelCase, parsed specs/parts JSON, numeric odometers,
// a boolean isFullTank. This module is the single place that converts between
// the two so the bridge returns byte-identical envelopes. It deliberately reads
// `_raw` fields instead of Model props so it stays correct even as WP2 evolves
// the schema.

export type Raw = Record<string, any>;

/** JSON TEXT column -> parsed value, or null. */
export function parseJson(v: unknown): any {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return v; // already parsed (e.g. pulled payload)
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const nn = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : num(v);

/** is_full_tank is stored 0/1 on the device but must be a boolean for the server. */
const toBool = (v: unknown): boolean => Number(v) === 1 || v === true;

/**
 * Optional text column -> server value. WatermelonDB stores an unset text column
 * as '' (it coerces null), while the server's routes return null for the same
 * empty field (e.g. `engine_cc || null`), so empty collapses to null for parity.
 */
const opt = (v: unknown): string | null => (v === '' || v == null ? null : (v as string));

/** object|string|null body value -> the JSON string a device TEXT column holds. */
function jsonCol(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

// ---- Device raw -> server shape -------------------------------------------

export function vehicleFromRaw(id: string, raw: Raw) {
  return {
    id,
    userId: null,
    name: raw.name ?? '',
    make: raw.make ?? '',
    model: raw.model ?? '',
    year: num(raw.year),
    engineCc: opt(raw.engine_cc),
    licensePlate: opt(raw.license_plate),
    initialOdometer: num(raw.initial_odometer),
    currentOdometer: num(raw.current_odometer),
    recommendedOil: opt(raw.recommended_oil),
    specs: parseJson(raw.specs),
    createdAt: raw.created_at_iso ?? null,
    updatedAt: raw.updated_at_iso ?? null,
  };
}

export function fuelFromRaw(id: string, raw: Raw) {
  return {
    id,
    vehicleId: raw.vehicle_id ?? '',
    fillDate: raw.fill_date ?? '',
    odometer: num(raw.odometer),
    liters: num(raw.liters),
    pricePerLiter: num(raw.price_per_liter),
    totalCost: num(raw.total_cost),
    isFullTank: toBool(raw.is_full_tank),
    notes: opt(raw.notes),
    createdAt: raw.created_at_iso ?? null,
  };
}

export function maintenanceFromRaw(id: string, raw: Raw) {
  return {
    id,
    vehicleId: raw.vehicle_id ?? '',
    serviceDate: raw.service_date ?? '',
    odometer: num(raw.odometer),
    serviceType: raw.service_type ?? '',
    title: raw.title ?? '',
    partsList: parseJson(raw.parts_list),
    partsCost: num(raw.parts_cost),
    laborCost: num(raw.labor_cost),
    totalCost: num(raw.total_cost),
    workshop: opt(raw.workshop),
    notes: opt(raw.notes),
    nextDueOdometer: nn(raw.next_due_odometer),
    nextDueDate: opt(raw.next_due_date),
    createdAt: raw.created_at_iso ?? null,
  };
}

export function scheduleFromRaw(id: string, raw: Raw) {
  return {
    id,
    vehicleId: raw.vehicle_id ?? '',
    itemCode: raw.item_code ?? '',
    titleAr: raw.title_ar ?? '',
    titleEn: raw.title_en ?? '',
    intervalKm: num(raw.interval_km),
    intervalMonths: nn(raw.interval_months),
    lastDoneOdometer: nn(raw.last_done_odometer),
    lastDoneDate: opt(raw.last_done_date),
  };
}

// ---- Server-shape request body -> device fields (keyed by sync-contract) ----
//
// The writer stores fields under the device column name via srvKey(); these
// builders emit that contract directly. Absent keys are OMITTED so an update
// never nullifies a column the caller didn't send (matches the server routes,
// which only SET the fields present in the body).

type Fields = Record<string, string | number | null>;

/** Add a key only when the body actually carried a value. */
function setWhen(
  f: Fields,
  key: string,
  present: boolean,
  value: string | number | null,
): void {
  if (present) f[key] = value;
}

export function vehicleFields(body: Raw, mode: 'create' | 'update', nowIso: string): Fields {
  const f: Fields = {};
  const has = (k: string) => body[k] !== undefined;
  setWhen(f, 'name', has('name'), body.name ?? null);
  setWhen(f, 'make', has('make'), body.make ?? null);
  setWhen(f, 'model', has('model'), body.model ?? null);
  setWhen(f, 'year', has('year'), num(body.year));
  setWhen(f, 'engine_cc', has('engineCc'), body.engineCc || null);
  setWhen(f, 'license_plate', has('licensePlate'), body.licensePlate ?? null);
  setWhen(f, 'initial_odometer', has('initialOdometer'), num(body.initialOdometer));
  setWhen(f, 'current_odometer', has('currentOdometer'), num(body.currentOdometer));
  setWhen(f, 'recommended_oil', has('recommendedOil'), body.recommendedOil ?? null);
  setWhen(f, 'specs', has('specs'), jsonCol(body.specs));
  if (mode === 'create') {
    f.created_at = has('createdAt') ? body.createdAt : nowIso;
  }
  // A vehicle write always stamps the business updatedAt, like the server.
  f.updated_at = has('updatedAt') ? body.updatedAt : nowIso;
  return f;
}

export function fuelFields(body: Raw, mode: 'create' | 'update', nowIso: string): Fields {
  const f: Fields = {};
  const has = (k: string) => body[k] !== undefined;
  setWhen(f, 'vehicle_id', has('vehicleId'), body.vehicleId ?? null);
  setWhen(f, 'fill_date', has('fillDate'), body.fillDate ?? null);
  setWhen(f, 'odometer', has('odometer'), num(body.odometer));
  setWhen(f, 'liters', has('liters'), num(body.liters));
  setWhen(f, 'price_per_liter', has('pricePerLiter'), num(body.pricePerLiter));
  setWhen(f, 'total_cost', has('totalCost'), num(body.totalCost));
  if (has('isFullTank')) f.is_full_tank = body.isFullTank ? 1 : 0;
  setWhen(f, 'notes', has('notes'), body.notes ?? null);
  if (mode === 'create') {
    f.created_at = has('createdAt') ? body.createdAt : nowIso;
  }
  return f;
}

export function maintenanceFields(body: Raw, mode: 'create' | 'update', nowIso: string): Fields {
  const f: Fields = {};
  const has = (k: string) => body[k] !== undefined;
  setWhen(f, 'vehicle_id', has('vehicleId'), body.vehicleId ?? null);
  setWhen(f, 'service_date', has('serviceDate'), body.serviceDate ?? null);
  setWhen(f, 'odometer', has('odometer'), num(body.odometer));
  setWhen(f, 'service_type', has('serviceType'), body.serviceType ?? null);
  setWhen(f, 'title', has('title'), body.title ?? null);
  setWhen(f, 'parts_list', has('partsList'), jsonCol(body.partsList));
  setWhen(f, 'parts_cost', has('partsCost'), num(body.partsCost));
  setWhen(f, 'labor_cost', has('laborCost'), num(body.laborCost));
  setWhen(f, 'total_cost', has('totalCost'), num(body.totalCost));
  setWhen(f, 'workshop', has('workshop'), body.workshop ?? null);
  setWhen(f, 'notes', has('notes'), body.notes ?? null);
  setWhen(f, 'next_due_odometer', has('nextDueOdometer'), nn(body.nextDueOdometer));
  setWhen(f, 'next_due_date', has('nextDueDate'), body.nextDueDate ?? null);
  if (mode === 'create') {
    f.created_at = has('createdAt') ? body.createdAt : nowIso;
  }
  return f;
}

export function schedulePatchFields(body: Raw): Fields {
  const f: Fields = {};
  const has = (k: string) => body[k] !== undefined;
  setWhen(f, 'last_done_odometer', has('lastDoneOdometer'), nn(body.lastDoneOdometer));
  setWhen(f, 'last_done_date', has('lastDoneDate'), body.lastDoneDate ?? null);
  setWhen(f, 'interval_km', has('intervalKm'), num(body.intervalKm));
  setWhen(f, 'interval_months', has('intervalMonths'), nn(body.intervalMonths));
  return f;
}

/**
 * Fields for seeding one factory preset onto a vehicle.
 *
 * NO baseline is written: a preset the owner never serviced must surface as
 * "service record required" (needs_record). Seeding the vehicle's initial
 * odometer/date here used to fabricate a service that never happened, and km
 * maths from a 0/absent baseline is what made a brand-new car look serviced.
 */
export function scheduleSeedFields(
  preset: { itemCode: string; titleAr: string; titleEn: string; intervalKm: number; intervalMonths?: number },
  vehicleId: string,
): Fields {
  return {
    vehicle_id: vehicleId,
    item_code: preset.itemCode,
    title_ar: preset.titleAr,
    title_en: preset.titleEn,
    interval_km: preset.intervalKm,
    interval_months: preset.intervalMonths ?? null,
    last_done_odometer: null,
    last_done_date: null,
  };
}

/**
 * Fields for a user-defined item created through POST /api/schedules — the same
 * row shape as a preset, with a `custom_…` item_code and no baseline.
 */
export function scheduleCreateFields(
  item: { itemCode: string; titleAr: string; titleEn: string; intervalKm: number; intervalMonths?: number | null },
  vehicleId: string,
): Fields {
  return {
    vehicle_id: vehicleId,
    item_code: item.itemCode,
    title_ar: item.titleAr,
    title_en: item.titleEn,
    interval_km: item.intervalKm,
    interval_months: item.intervalMonths ?? null,
    last_done_odometer: null,
    last_done_date: null,
  };
}
