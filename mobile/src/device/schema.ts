import { appSchema, tableSchema } from '@nozbe/watermelondb';

// One source of truth for the device columns of each synced table.
//   col  = device (WatermelonDB) column name.
//   srv  = server column name in the /api/sync contract. Defaults to `col`.
//          Used where WatermelonDB reserves the natural name (created_at /
//          updated_at must be numeric), so we keep an *_iso string column that
//          still serialises back to the server's snake_case key.
//   prop = the camelCase property exposed on the WatermelonDB Model.
//   type = WatermelonDB column type. is_full_tank is stored as number (0/1) to
//          avoid boolean coercion between SQLite ints and JS booleans.
// Business cols are pushed/pulled; the trailing three are device-local bookkeeping.

export type ColType = 'string' | 'number' | 'boolean';
export interface ColDef { col: string; prop: string; type: ColType; srv?: string; }

/** Server-side key a device column maps to in the sync contract. */
export const srvKey = (c: ColDef): string => c.srv ?? c.col;

export const DEVICE_COLS: Record<string, ColDef[]> = {
  vehicles: [
    { col: 'name', prop: 'name', type: 'string' },
    { col: 'make', prop: 'make', type: 'string' },
    { col: 'model', prop: 'model', type: 'string' },
    { col: 'year', prop: 'year', type: 'number' },
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
    { col: 'interval_months', prop: 'intervalMonths', type: 'number' },
    { col: 'last_done_odometer', prop: 'lastDoneOdometer', type: 'number' },
    { col: 'last_done_date', prop: 'lastDoneDate', type: 'string' },
  ],
  maintenance_logs: [
    { col: 'vehicle_id', prop: 'vehicleId', type: 'string' },
    { col: 'service_date', prop: 'serviceDate', type: 'string' },
    { col: 'odometer', prop: 'odometer', type: 'number' },
    { col: 'service_type', prop: 'serviceType', type: 'string' },
    { col: 'title', prop: 'title', type: 'string' },
    { col: 'parts_list', prop: 'partsList', type: 'string' },
    { col: 'parts_cost', prop: 'partsCost', type: 'number' },
    { col: 'labor_cost', prop: 'laborCost', type: 'number' },
    { col: 'total_cost', prop: 'totalCost', type: 'number' },
    { col: 'workshop', prop: 'workshop', type: 'string' },
    { col: 'notes', prop: 'notes', type: 'string' },
    { col: 'next_due_odometer', prop: 'nextDueOdometer', type: 'number' },
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
    { name: 'updated_at_sync', type: 'number' as ColType }, // LWW timestamp (updatedAt)
    { name: '_dirty', type: 'string' as ColType },
    { name: '_deleted_at', type: 'number' as ColType },
  ];
}

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
