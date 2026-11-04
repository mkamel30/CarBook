import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { groupsOf } from '@sync/fieldGroups';

// One source of truth for the device columns of each synced table.
//   col  = device (WatermelonDB) column name.
//   srv  = server column name in the /api/sync contract. Defaults to `col`.
//          Used where WatermelonDB reserves the natural name (created_at /
//          updated_at must be numeric), so we keep an *_iso string column that
//          still serialises back to the server's snake_case key.
//   prop = the camelCase property exposed on the WatermelonDB Model.
//   type = WatermelonDB column type. is_full_tank is stored as number (0/1) to
//          avoid boolean coercion between SQLite ints and JS booleans.
//   json = the device column keeps a JSON TEXT blob, but the server's Zod
//          validators demand the parsed structure on push (e.g. maintenance_logs
//          .parts_list must arrive as an array of maintenancePartItemSchema).
//          The push/pull layer converts with toSrvValue/toDeviceValue so the
//          WatermelonDB column itself stays a string.
// Business cols are pushed/pulled; the trailing columns are device-local bookkeeping.

export type ColType = 'string' | 'number' | 'boolean';
export interface ColDef {
  col: string;
  prop: string;
  type: ColType;
  srv?: string;
  json?: boolean;
  /**
   * Nullable on the server, and a NUMBER on the device. WatermelonDB cannot keep
   * a null in a column — a create stores the column default (0 for numbers, ''
   * for strings) — so the device's encoding of "no value" in such a column is 0,
   * exactly as '' is for a text column. Every boundary that leaves the device
   * (the read mapping, the sync push, the backup export) collapses it back to
   * null, so an unserviced item never travels as a fabricated "serviced at 0 km".
   *
   * Accepted cost: a service recorded at odometer reading exactly 0 reads back as
   * "no record". A real car is never serviced at 0, while every preset car is.
   */
  nul?: boolean;
}

/** Server-side key a device column maps to in the sync contract. */
export const srvKey = (c: ColDef): string => c.srv ?? c.col;

/** Device stored value -> value placed in the push payload. */
export function toSrvValue(c: ColDef, v: string | number | null | undefined): unknown {
  if (c.nul && (v === null || v === undefined || v === '' || Number(v) === 0)) return null;
  if (!c.json || typeof v !== 'string') return v ?? null;
  const s = v.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    // Malformed local JSON is sent as-is: the server refuses it per-row with a
    // reason, remarkRejected keeps the row dirty, and the user can fix it.
    return v;
  }
}

/** Pulled server value -> value stored in the (string) device column. */
export function toDeviceValue(c: ColDef, v: unknown): string | number | null {
  if (v === undefined || v === null) return null;
  if (c.json && typeof v !== 'string') return typeof v === 'object' ? JSON.stringify(v) : (v as string | number);
  return v as string | number;
}

export const DEVICE_COLS: Record<string, ColDef[]> = {
  vehicles: [
    { col: 'name', prop: 'name', type: 'string' },
    { col: 'make', prop: 'make', type: 'string' },
    { col: 'model', prop: 'model', type: 'string' },
    { col: 'year', prop: 'year', type: 'number' },
    // Server-owned column that was missing from the device: an offline edit
    // pushed without it and the sync upsert nullified engine_cc server-side.
    { col: 'engine_cc', prop: 'engineCc', type: 'string' },
    { col: 'license_plate', prop: 'licensePlate', type: 'string' },
    { col: 'initial_odometer', prop: 'initialOdometer', type: 'number' },
    { col: 'current_odometer', prop: 'currentOdometer', type: 'number' },
    { col: 'recommended_oil', prop: 'recommendedOil', type: 'string' },
    { col: 'specs', prop: 'specs', type: 'string' },
    { col: 'created_at_iso', prop: 'createdAt', type: 'string', srv: 'created_at' },
    { col: 'updated_at_iso', prop: 'updatedAtBiz', type: 'string', srv: 'updated_at' },
  ],
  maintenance_schedules: [
    { col: 'vehicle_id', prop: 'vehicleId', type: 'string' },
    { col: 'item_code', prop: 'itemCode', type: 'string' },
    { col: 'title_ar', prop: 'titleAr', type: 'string' },
    { col: 'title_en', prop: 'titleEn', type: 'string' },
    { col: 'interval_km', prop: 'intervalKm', type: 'number' },
    { col: 'interval_months', prop: 'intervalMonths', type: 'number', nul: true },
    { col: 'last_done_odometer', prop: 'lastDoneOdometer', type: 'number', nul: true },
    { col: 'last_done_date', prop: 'lastDoneDate', type: 'string' },
  ],
  maintenance_logs: [
    { col: 'vehicle_id', prop: 'vehicleId', type: 'string' },
    { col: 'service_date', prop: 'serviceDate', type: 'string' },
    { col: 'odometer', prop: 'odometer', type: 'number' },
    { col: 'service_type', prop: 'serviceType', type: 'string' },
    { col: 'title', prop: 'title', type: 'string' },
    { col: 'parts_list', prop: 'partsList', type: 'string', json: true },
    { col: 'parts_cost', prop: 'partsCost', type: 'number' },
    { col: 'labor_cost', prop: 'laborCost', type: 'number' },
    { col: 'total_cost', prop: 'totalCost', type: 'number' },
    { col: 'workshop', prop: 'workshop', type: 'string' },
    { col: 'notes', prop: 'notes', type: 'string' },
    { col: 'next_due_odometer', prop: 'nextDueOdometer', type: 'number', nul: true },
    { col: 'next_due_date', prop: 'nextDueDate', type: 'string' },
    { col: 'created_at_iso', prop: 'createdAt', type: 'string', srv: 'created_at' },
  ],
  fuel_logs: [
    { col: 'vehicle_id', prop: 'vehicleId', type: 'string' },
    { col: 'fill_date', prop: 'fillDate', type: 'string' },
    { col: 'odometer', prop: 'odometer', type: 'number' },
    { col: 'liters', prop: 'liters', type: 'number' },
    { col: 'price_per_liter', prop: 'pricePerLiter', type: 'number' },
    { col: 'total_cost', prop: 'totalCost', type: 'number' },
    { col: 'is_full_tank', prop: 'isFullTank', type: 'number' },
    { col: 'notes', prop: 'notes', type: 'string' },
    { col: 'created_at_iso', prop: 'createdAt', type: 'string', srv: 'created_at' },
  ],
};

function wmColumns(tableName: string) {
  const cols = DEVICE_COLS[tableName].map(c => ({ name: c.col, type: c.type }));
  return [
    ...cols,
    { name: 'updated_at_sync', type: 'number' as ColType }, // row revision (outbox bookkeeping + `updatedAt`)
    // One LWW stamp per field group (see @sync/fieldGroups): a baseline advance
    // must not also claim the item's config is newer, or it overwrites a peer's
    // fresher interval edit. Rows written before these columns existed read as
    // undefined and fall back to `updated_at_sync` — the old row-level rule.
    ...(groupsOf(tableName) ?? []).map(g => ({ name: g.deviceTsColumn, type: 'number' as ColType })),
    { name: '_dirty', type: 'string' as ColType },
    { name: '_deleted_at', type: 'number' as ColType },
    // Set when the server refuses a pushed row per-row (sync remarkRejected);
    // carries the refusal reason so UI can surface it. Cleared on ack/edit.
    { name: 'rejected_reason', type: 'string' as ColType },
  ];
}

// NOTE: version stays 1 deliberately. New columns here are DEVICE-ONLY
// bookkeeping, and the LokiJS adapter stores each row as a document: a row from
// an older snapshot simply has no value for them, and the stamping code falls
// back to `updated_at_sync`. Bumping the version without supplying a migration
// function makes WatermelonDB throw at boot for every installed app — strictly
// worse than the additive column. A BUSINESS column change, or the first real
// SQLite adapter, is where version bumps + migration steps become mandatory.
export const deviceSchema = appSchema({
  version: 1,
  tables: [
    tableSchema({ name: 'vehicles', columns: wmColumns('vehicles') }),
    tableSchema({ name: 'maintenance_schedules', columns: wmColumns('maintenance_schedules') }),
    tableSchema({ name: 'maintenance_logs', columns: wmColumns('maintenance_logs') }),
    tableSchema({ name: 'fuel_logs', columns: wmColumns('fuel_logs') }),
  ],
});

export const SYNC_TABLE_NAMES = Object.keys(DEVICE_COLS);
