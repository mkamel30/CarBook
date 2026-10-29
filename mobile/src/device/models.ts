import { Model } from '@nozbe/watermelondb';
import { text, field } from '@nozbe/watermelondb/decorators';

// Property names here MUST match the `prop` values in schema.ts DEVICE_COLS;
// the sync LocalStore reads/writes records generically through that map.
// WatermelonDB has no @number/@boolean decorators — non-string columns use @field,
// which infers the type from the schema.

export class VehicleModel extends Model {
  static table = 'vehicles';

  @text('name') name!: string;
  @text('make') make!: string;
  @text('model') model!: string;
  @field('year') year!: number;
  @text('license_plate') licensePlate?: string;
  @field('initial_odometer') initialOdometer!: number;
  @field('current_odometer') currentOdometer!: number;
  @text('recommended_oil') recommendedOil?: string;
  @text('specs') specs?: string;
  @text('created_at_iso') createdAt!: string;
  @text('updated_at_iso') updatedAtBiz!: string;

  @field('updated_at_sync') syncTs!: number;
  @text('_dirty') dirty?: string;
  @field('_deleted_at') deletedAt!: number;
}

export class MaintenanceScheduleModel extends Model {
  static table = 'maintenance_schedules';

  @text('vehicle_id') vehicleId!: string;
  @text('item_code') itemCode!: string;
  @text('title_ar') titleAr!: string;
  @text('title_en') titleEn!: string;
  @field('interval_km') intervalKm!: number;
  @field('interval_months') intervalMonths?: number;
  @field('last_done_odometer') lastDoneOdometer?: number;
  @text('last_done_date') lastDoneDate?: string;

  @field('updated_at_sync') syncTs!: number;
  @text('_dirty') dirty?: string;
  @field('_deleted_at') deletedAt!: number;
}

export class MaintenanceLogModel extends Model {
  static table = 'maintenance_logs';

  @text('vehicle_id') vehicleId!: string;
  @text('service_date') serviceDate!: string;
  @field('odometer') odometer!: number;
  @text('service_type') serviceType!: string;
  @text('title') title!: string;
  @text('parts_list') partsList?: string;
  @field('parts_cost') partsCost!: number;
  @field('labor_cost') laborCost!: number;
  @field('total_cost') totalCost!: number;
  @text('workshop') workshop?: string;
  @text('notes') notes?: string;
  @field('next_due_odometer') nextDueOdometer?: number;
  @text('next_due_date') nextDueDate?: string;
  @text('created_at_iso') createdAt!: string;

  @field('updated_at_sync') syncTs!: number;
  @text('_dirty') dirty?: string;
  @field('_deleted_at') deletedAt!: number;
}

export class FuelLogModel extends Model {
  static table = 'fuel_logs';

  @text('vehicle_id') vehicleId!: string;
  @text('fill_date') fillDate!: string;
  @field('odometer') odometer!: number;
  @field('liters') liters!: number;
  @field('price_per_liter') pricePerLiter!: number;
  @field('total_cost') totalCost!: number;
  @field('is_full_tank') isFullTank!: number;
  @text('notes') notes?: string;
  @text('created_at_iso') createdAt!: string;

  @field('updated_at_sync') syncTs!: number;
  @text('_dirty') dirty?: string;
  @field('_deleted_at') deletedAt!: number;
}

export const MODELS: Record<string, typeof Model> = {
  vehicles: VehicleModel,
  maintenance_schedules: MaintenanceScheduleModel,
  maintenance_logs: MaintenanceLogModel,
  fuel_logs: FuelLogModel,
};
