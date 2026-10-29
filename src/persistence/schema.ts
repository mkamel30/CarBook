import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(), // Google sub
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  picture: text('picture'),
  createdAt: text('created_at').notNull(),
  lastLoginAt: text('last_login_at').notNull(),
});

export const vehiclesTable = sqliteTable('vehicles', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  make: text('make').notNull(),
  model: text('model').notNull(),
  year: integer('year').notNull(),
  licensePlate: text('license_plate'),
  initialOdometer: real('initial_odometer').notNull().default(0),
  currentOdometer: real('current_odometer').notNull().default(0),
  recommendedOil: text('recommended_oil'),
  specs: text('specs'), // JSON string of VehicleSpecs
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const maintenanceSchedulesTable = sqliteTable('maintenance_schedules', {
  id: text('id').primaryKey(),
  vehicleId: text('vehicle_id').notNull().references(() => vehiclesTable.id, { onDelete: 'cascade' }),
  itemCode: text('item_code').notNull(),
  titleAr: text('title_ar').notNull(),
  titleEn: text('title_en').notNull(),
  intervalKm: real('interval_km').notNull(),
  intervalMonths: integer('interval_months'),
  lastDoneOdometer: real('last_done_odometer'),
  lastDoneDate: text('last_done_date'),
});

export const maintenanceLogsTable = sqliteTable('maintenance_logs', {
  id: text('id').primaryKey(),
  vehicleId: text('vehicle_id').notNull().references(() => vehiclesTable.id, { onDelete: 'cascade' }),
  serviceDate: text('service_date').notNull(),
  odometer: real('odometer').notNull(),
  serviceType: text('service_type').notNull(),
  title: text('title').notNull(),
  partsList: text('parts_list'), // JSON string of MaintenancePartItem[]
  partsCost: real('parts_cost').notNull().default(0),
  laborCost: real('labor_cost').notNull().default(0),
  totalCost: real('total_cost').notNull(),
  workshop: text('workshop'),
  notes: text('notes'),
  nextDueOdometer: real('next_due_odometer'),
  nextDueDate: text('next_due_date'),
  createdAt: text('created_at').notNull(),
});

export const fuelLogsTable = sqliteTable('fuel_logs', {
  id: text('id').primaryKey(),
  vehicleId: text('vehicle_id').notNull().references(() => vehiclesTable.id, { onDelete: 'cascade' }),
  fillDate: text('fill_date').notNull(),
  odometer: real('odometer').notNull(),
  liters: real('liters').notNull(),
  pricePerLiter: real('price_per_liter').notNull(),
  totalCost: real('total_cost').notNull(),
  isFullTank: integer('is_full_tank', { mode: 'boolean' }).notNull().default(true),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
});

export const appSettingsTable = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  isEncrypted: integer('is_encrypted', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull(),
});

export const globalVehicleSpecsCacheTable = sqliteTable('global_vehicle_specs_cache', {
  id: text('id').primaryKey(),
  makeNormalized: text('make_normalized').notNull(),
  modelNormalized: text('model_normalized').notNull(),
  year: integer('year').notNull(),
  specsJson: text('specs_json').notNull(),
  schedulesJson: text('schedules_json'),
  recommendedOil: text('recommended_oil'),
  source: text('source').notNull().default('server_gemini'),
  createdAt: text('created_at').notNull(),
  hitCount: integer('hit_count').notNull().default(1),
});

