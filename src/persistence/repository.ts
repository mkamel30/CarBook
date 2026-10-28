import { getDatabase } from './db';
import * as schema from './schema';
import { eq, desc } from 'drizzle-orm';
import {
  vehicleSchema,
  maintenanceScheduleSchema,
  maintenanceLogSchema,
  fuelLogSchema,
  type Vehicle,
  type MaintenanceSchedule,
  type MaintenanceLog,
  type FuelLog,
} from '../domain/schemas';
import crypto from 'crypto';

export class StorageRepository {
  private dbPromise: ReturnType<typeof getDatabase>;

  constructor(customDbPath?: string) {
    this.dbPromise = getDatabase(customDbPath);
  }

  private async getHandles() {
    return await this.dbPromise;
  }

  // Vehicles
  async createVehicle(data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vehicle> {
    const { db } = await this.getHandles();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const validated = vehicleSchema.parse({
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.vehiclesTable).values({
      id: validated.id!,
      name: validated.name,
      make: validated.make,
      model: validated.model,
      year: validated.year,
      licensePlate: validated.licensePlate,
      initialOdometer: validated.initialOdometer,
      currentOdometer: validated.currentOdometer,
      recommendedOil: validated.recommendedOil,
      createdAt: validated.createdAt!,
      updatedAt: validated.updatedAt!,
    });

    return validated;
  }

  async getVehicleById(id: string): Promise<Vehicle | null> {
    const { db } = await this.getHandles();
    const records = await db.select().from(schema.vehiclesTable).where(eq(schema.vehiclesTable.id, id));
    if (records.length === 0) return null;
    const r = records[0];
    return vehicleSchema.parse({
      id: r.id,
      name: r.name,
      make: r.make,
      model: r.model,
      year: r.year,
      licensePlate: r.licensePlate,
      initialOdometer: r.initialOdometer,
      currentOdometer: r.currentOdometer,
      recommendedOil: r.recommendedOil,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
  }

  async getAllVehicles(): Promise<Vehicle[]> {
    const { db } = await this.getHandles();
    const records = await db.select().from(schema.vehiclesTable);
    return records.map(r => vehicleSchema.parse({
      id: r.id,
      name: r.name,
      make: r.make,
      model: r.model,
      year: r.year,
      licensePlate: r.licensePlate,
      initialOdometer: r.initialOdometer,
      currentOdometer: r.currentOdometer,
      recommendedOil: r.recommendedOil,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  // Maintenance Schedules
  async addMaintenanceSchedule(data: Omit<MaintenanceSchedule, 'id'>): Promise<MaintenanceSchedule> {
    const { db } = await this.getHandles();
    const id = crypto.randomUUID();
    const validated = maintenanceScheduleSchema.parse({ ...data, id });

    await db.insert(schema.maintenanceSchedulesTable).values({
      id: validated.id!,
      vehicleId: validated.vehicleId,
      itemCode: validated.itemCode,
      titleAr: validated.titleAr,
      titleEn: validated.titleEn,
      intervalKm: validated.intervalKm,
      intervalMonths: validated.intervalMonths,
      lastDoneOdometer: validated.lastDoneOdometer,
      lastDoneDate: validated.lastDoneDate,
    });

    return validated;
  }

  async getSchedulesByVehicle(vehicleId: string): Promise<MaintenanceSchedule[]> {
    const { db } = await this.getHandles();
    const records = await db.select()
      .from(schema.maintenanceSchedulesTable)
      .where(eq(schema.maintenanceSchedulesTable.vehicleId, vehicleId));

    return records.map(r => maintenanceScheduleSchema.parse(r));
  }

  // Fuel Logs with Transactional Atomic Odometer Sync
  async addFuelLog(data: Omit<FuelLog, 'id' | 'createdAt'>): Promise<FuelLog> {
    const { client, db } = await this.getHandles();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const validated = fuelLogSchema.parse({ ...data, id, createdAt: now });

    // Execute atomic batch transaction
    await client.batch([
      {
        sql: `INSERT INTO fuel_logs (id, vehicle_id, fill_date, odometer, liters, price_per_liter, total_cost, is_full_tank, notes, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          validated.id!,
          validated.vehicleId,
          validated.fillDate,
          validated.odometer,
          validated.liters,
          validated.pricePerLiter,
          validated.totalCost,
          validated.isFullTank ? 1 : 0,
          validated.notes || null,
          validated.createdAt!,
        ],
      },
      {
        sql: `UPDATE vehicles SET current_odometer = MAX(current_odometer, ?), updated_at = ? WHERE id = ?`,
        args: [validated.odometer, now, validated.vehicleId],
      },
    ], 'write');

    return validated;
  }

  async getFuelLogsByVehicle(vehicleId: string): Promise<FuelLog[]> {
    const { db } = await this.getHandles();
    const records = await db.select()
      .from(schema.fuelLogsTable)
      .where(eq(schema.fuelLogsTable.vehicleId, vehicleId))
      .orderBy(desc(schema.fuelLogsTable.odometer));

    return records.map(r => fuelLogSchema.parse({
      ...r,
      isFullTank: Boolean(r.isFullTank),
    }));
  }

  // Maintenance Logs with Transactional Atomic Odometer Sync
  async addMaintenanceLog(data: Omit<MaintenanceLog, 'id' | 'createdAt'>): Promise<MaintenanceLog> {
    const { client } = await this.getHandles();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const validated = maintenanceLogSchema.parse({ ...data, id, createdAt: now });

    await client.batch([
      {
        sql: `INSERT INTO maintenance_logs (id, vehicle_id, service_date, odometer, service_type, title, parts_cost, labor_cost, total_cost, workshop, notes, next_due_odometer, next_due_date, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          validated.id!,
          validated.vehicleId,
          validated.serviceDate,
          validated.odometer,
          validated.serviceType,
          validated.title,
          validated.partsCost,
          validated.laborCost,
          validated.totalCost,
          validated.workshop || null,
          validated.notes || null,
          validated.nextDueOdometer || null,
          validated.nextDueDate || null,
          validated.createdAt!,
        ],
      },
      {
        sql: `UPDATE vehicles SET current_odometer = MAX(current_odometer, ?), updated_at = ? WHERE id = ?`,
        args: [validated.odometer, now, validated.vehicleId],
      },
    ], 'write');

    return validated;
  }

  async getMaintenanceLogsByVehicle(vehicleId: string): Promise<MaintenanceLog[]> {
    const { db } = await this.getHandles();
    const records = await db.select()
      .from(schema.maintenanceLogsTable)
      .where(eq(schema.maintenanceLogsTable.vehicleId, vehicleId))
      .orderBy(desc(schema.maintenanceLogsTable.odometer));

    return records.map(r => maintenanceLogSchema.parse(r));
  }

  // App Settings
  async setSetting(key: string, value: string, isEncrypted = false): Promise<void> {
    const { client } = await this.getHandles();
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO app_settings (key, value, is_encrypted, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_encrypted = excluded.is_encrypted, updated_at = excluded.updated_at`,
      args: [key, value, isEncrypted ? 1 : 0, now],
    });
  }

  async getSetting(key: string): Promise<string | null> {
    const { db } = await this.getHandles();
    const records = await db.select().from(schema.appSettingsTable).where(eq(schema.appSettingsTable.key, key));
    return records.length > 0 ? records[0].value : null;
  }

  async close() {
    const { client } = await this.getHandles();
    client.close();
  }
}
