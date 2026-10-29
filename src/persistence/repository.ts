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

  async updateFuelLog(id: string, data: Partial<Omit<FuelLog, 'id' | 'createdAt'>>): Promise<FuelLog> {
    const { client, db } = await this.getHandles();
    const existingRecords = await db.select().from(schema.fuelLogsTable).where(eq(schema.fuelLogsTable.id, id));
    if (existingRecords.length === 0) {
      throw new Error(`Fuel log ${id} not found`);
    }
    const existing = existingRecords[0];
    const merged = {
      id: existing.id,
      vehicleId: existing.vehicleId,
      fillDate: data.fillDate ?? existing.fillDate,
      odometer: data.odometer ?? existing.odometer,
      liters: data.liters ?? existing.liters,
      pricePerLiter: data.pricePerLiter ?? existing.pricePerLiter,
      totalCost: data.totalCost ?? existing.totalCost,
      isFullTank: data.isFullTank ?? Boolean(existing.isFullTank),
      notes: data.notes !== undefined ? data.notes : existing.notes,
      createdAt: existing.createdAt,
    };

    const validated = fuelLogSchema.parse(merged);
    const now = new Date().toISOString();

    await client.batch([
      {
        sql: `UPDATE fuel_logs
              SET fill_date = ?, odometer = ?, liters = ?, price_per_liter = ?, total_cost = ?, is_full_tank = ?, notes = ?
              WHERE id = ?`,
        args: [
          validated.fillDate,
          validated.odometer,
          validated.liters,
          validated.pricePerLiter,
          validated.totalCost,
          validated.isFullTank ? 1 : 0,
          validated.notes || null,
          id,
        ],
      },
      {
        // Re-evaluate vehicle max odometer across fuel, maintenance, and initial odometer
        sql: `UPDATE vehicles
              SET current_odometer = (
                SELECT MAX(odo) FROM (
                  SELECT initial_odometer AS odo FROM vehicles WHERE id = ?
                  UNION ALL
                  SELECT odometer AS odo FROM fuel_logs WHERE vehicle_id = ?
                  UNION ALL
                  SELECT odometer AS odo FROM maintenance_logs WHERE vehicle_id = ?
                )
              ),
              updated_at = ?
              WHERE id = ?`,
        args: [validated.vehicleId, validated.vehicleId, validated.vehicleId, now, validated.vehicleId],
      },
    ], 'write');

    return validated;
  }

  async deleteFuelLog(id: string): Promise<void> {
    const { client, db } = await this.getHandles();
    const existing = await db.select().from(schema.fuelLogsTable).where(eq(schema.fuelLogsTable.id, id));
    if (existing.length === 0) return;
    const vehicleId = existing[0].vehicleId;
    const now = new Date().toISOString();

    await client.batch([
      {
        sql: `DELETE FROM fuel_logs WHERE id = ?`,
        args: [id],
      },
      {
        sql: `UPDATE vehicles
              SET current_odometer = (
                SELECT MAX(odo) FROM (
                  SELECT initial_odometer AS odo FROM vehicles WHERE id = ?
                  UNION ALL
                  SELECT odometer AS odo FROM fuel_logs WHERE vehicle_id = ?
                  UNION ALL
                  SELECT odometer AS odo FROM maintenance_logs WHERE vehicle_id = ?
                )
              ),
              updated_at = ?
              WHERE id = ?`,
        args: [vehicleId, vehicleId, vehicleId, now, vehicleId],
      },
    ], 'write');
  }

  // Maintenance Logs with Transactional Atomic Odometer Sync
  async addMaintenanceLog(data: Omit<MaintenanceLog, 'id' | 'createdAt'>): Promise<MaintenanceLog> {
    const { client } = await this.getHandles();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const validated = maintenanceLogSchema.parse({ ...data, id, createdAt: now });

    await client.batch([
      {
        sql: `INSERT INTO maintenance_logs (id, vehicle_id, service_date, odometer, service_type, title, parts_list, parts_cost, labor_cost, total_cost, workshop, notes, next_due_odometer, next_due_date, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          validated.id!,
          validated.vehicleId,
          validated.serviceDate,
          validated.odometer,
          validated.serviceType,
          validated.title,
          validated.partsList ? JSON.stringify(validated.partsList) : null,
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

  async updateMaintenanceLog(id: string, data: Partial<Omit<MaintenanceLog, 'id' | 'createdAt'>>): Promise<MaintenanceLog> {
    const { client, db } = await this.getHandles();
    const existingRecords = await db.select().from(schema.maintenanceLogsTable).where(eq(schema.maintenanceLogsTable.id, id));
    if (existingRecords.length === 0) {
      throw new Error(`Maintenance log ${id} not found`);
    }
    const existing = existingRecords[0];
    const existingParts = existing.partsList ? JSON.parse(existing.partsList) : null;

    const merged = {
      id: existing.id,
      vehicleId: existing.vehicleId,
      serviceDate: data.serviceDate ?? existing.serviceDate,
      odometer: data.odometer ?? existing.odometer,
      serviceType: data.serviceType ?? existing.serviceType,
      title: data.title ?? existing.title,
      partsList: data.partsList !== undefined ? data.partsList : existingParts,
      partsCost: data.partsCost ?? existing.partsCost,
      laborCost: data.laborCost ?? existing.laborCost,
      totalCost: data.totalCost ?? existing.totalCost,
      workshop: data.workshop !== undefined ? data.workshop : existing.workshop,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      nextDueOdometer: data.nextDueOdometer !== undefined ? data.nextDueOdometer : existing.nextDueOdometer,
      nextDueDate: data.nextDueDate !== undefined ? data.nextDueDate : existing.nextDueDate,
      createdAt: existing.createdAt,
    };

    const validated = maintenanceLogSchema.parse(merged);
    const now = new Date().toISOString();

    await client.batch([
      {
        sql: `UPDATE maintenance_logs
              SET service_date = ?, odometer = ?, service_type = ?, title = ?, parts_list = ?, parts_cost = ?, labor_cost = ?, total_cost = ?, workshop = ?, notes = ?, next_due_odometer = ?, next_due_date = ?
              WHERE id = ?`,
        args: [
          validated.serviceDate,
          validated.odometer,
          validated.serviceType,
          validated.title,
          validated.partsList ? JSON.stringify(validated.partsList) : null,
          validated.partsCost,
          validated.laborCost,
          validated.totalCost,
          validated.workshop || null,
          validated.notes || null,
          validated.nextDueOdometer || null,
          validated.nextDueDate || null,
          id,
        ],
      },
      {
        sql: `UPDATE vehicles
              SET current_odometer = (
                SELECT MAX(odo) FROM (
                  SELECT initial_odometer AS odo FROM vehicles WHERE id = ?
                  UNION ALL
                  SELECT odometer AS odo FROM fuel_logs WHERE vehicle_id = ?
                  UNION ALL
                  SELECT odometer AS odo FROM maintenance_logs WHERE vehicle_id = ?
                )
              ),
              updated_at = ?
              WHERE id = ?`,
        args: [validated.vehicleId, validated.vehicleId, validated.vehicleId, now, validated.vehicleId],
      },
    ], 'write');

    return validated;
  }

  async deleteMaintenanceLog(id: string): Promise<void> {
    const { client, db } = await this.getHandles();
    const existing = await db.select().from(schema.maintenanceLogsTable).where(eq(schema.maintenanceLogsTable.id, id));
    if (existing.length === 0) return;
    const vehicleId = existing[0].vehicleId;
    const now = new Date().toISOString();

    await client.batch([
      {
        sql: `DELETE FROM maintenance_logs WHERE id = ?`,
        args: [id],
      },
      {
        sql: `UPDATE vehicles
              SET current_odometer = (
                SELECT MAX(odo) FROM (
                  SELECT initial_odometer AS odo FROM vehicles WHERE id = ?
                  UNION ALL
                  SELECT odometer AS odo FROM fuel_logs WHERE vehicle_id = ?
                  UNION ALL
                  SELECT odometer AS odo FROM maintenance_logs WHERE vehicle_id = ?
                )
              ),
              updated_at = ?
              WHERE id = ?`,
        args: [vehicleId, vehicleId, vehicleId, now, vehicleId],
      },
    ], 'write');
  }

  async getMaintenanceLogsByVehicle(vehicleId: string): Promise<MaintenanceLog[]> {
    const { db } = await this.getHandles();
    const records = await db.select()
      .from(schema.maintenanceLogsTable)
      .where(eq(schema.maintenanceLogsTable.vehicleId, vehicleId))
      .orderBy(desc(schema.maintenanceLogsTable.odometer));

    return records.map(r => {
      let partsList = null;
      if (r.partsList) {
        try {
          partsList = JSON.parse(r.partsList);
        } catch {}
      }
      return maintenanceLogSchema.parse({
        ...r,
        partsList,
      });
    });
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
