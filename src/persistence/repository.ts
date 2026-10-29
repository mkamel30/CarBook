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

  // Users & Multi-Tenancy
  async findOrCreateUser(profile: { id: string; email: string; name: string; picture?: string }): Promise<{
    id: string;
    email: string;
    name: string;
    picture: string | null;
  }> {
    const { client } = await this.getHandles();
    const now = new Date().toISOString();

    const existing = await client.execute({
      sql: `SELECT id, email, name, picture FROM users WHERE id = ? OR email = ? LIMIT 1`,
      args: [profile.id, profile.email],
    });

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      await client.execute({
        sql: `UPDATE users SET last_login_at = ?, name = ?, picture = COALESCE(?, picture) WHERE id = ?`,
        args: [now, profile.name, profile.picture || null, user.id as string],
      });
      return {
        id: user.id as string,
        email: user.email as string,
        name: profile.name || (user.name as string),
        picture: profile.picture || (user.picture as string | null),
      };
    }

    // Insert new user
    await client.execute({
      sql: `INSERT INTO users (id, email, name, picture, created_at, last_login_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [profile.id, profile.email, profile.name, profile.picture || null, now, now],
    });

    // Automatic migration: If there are legacy vehicles with user_id IS NULL, assign them to this first user!
    await client.execute({
      sql: `UPDATE vehicles SET user_id = ? WHERE user_id IS NULL`,
      args: [profile.id],
    });

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture || null,
    };
  }

  async getUserById(id: string): Promise<{ id: string; email: string; name: string; picture: string | null } | null> {
    const { client } = await this.getHandles();
    const res = await client.execute({
      sql: `SELECT id, email, name, picture FROM users WHERE id = ? LIMIT 1`,
      args: [id],
    });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id as string,
      email: r.email as string,
      name: r.name as string,
      picture: (r.picture as string) || null,
    };
  }

  // Vehicles
  async createVehicle(data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>, userId?: string): Promise<Vehicle> {
    const { db } = await this.getHandles();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const validated = vehicleSchema.parse({
      ...data,
      id,
      userId: userId || data.userId || null,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.vehiclesTable).values({
      id: validated.id!,
      userId: validated.userId || null,
      name: validated.name,
      make: validated.make,
      model: validated.model,
      year: validated.year,
      licensePlate: validated.licensePlate,
      initialOdometer: validated.initialOdometer,
      currentOdometer: validated.currentOdometer,
      recommendedOil: validated.recommendedOil,
      specs: validated.specs ? JSON.stringify(validated.specs) : null,
      createdAt: validated.createdAt!,
      updatedAt: validated.updatedAt!,
    });

    return validated;
  }

  async updateVehicleSpecs(vehicleId: string, specs: any): Promise<void> {
    const { client } = await this.getHandles();
    const now = new Date().toISOString();
    await client.execute({
      sql: `UPDATE vehicles SET specs = ?, updated_at = ? WHERE id = ?`,
      args: [JSON.stringify(specs), now, vehicleId],
    });
  }

  async getVehicleById(id: string, userId?: string): Promise<Vehicle | null> {
    const { client } = await this.getHandles();
    let query = `SELECT * FROM vehicles WHERE id = ?`;
    const args: any[] = [id];

    if (userId) {
      query += ` AND (user_id = ? OR user_id IS NULL)`;
      args.push(userId);
    }

    const res = await client.execute({ sql: query, args });
    if (res.rows.length === 0) return null;
    const r = res.rows[0] as any;

    let specs = null;
    if (r.specs) {
      try {
        specs = JSON.parse(r.specs);
      } catch {}
    }
    return vehicleSchema.parse({
      id: r.id,
      userId: r.user_id || null,
      name: r.name,
      make: r.make,
      model: r.model,
      year: Number(r.year),
      licensePlate: r.license_plate,
      initialOdometer: Number(r.initial_odometer),
      currentOdometer: Number(r.current_odometer),
      recommendedOil: r.recommended_oil,
      specs,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }

  async getAllVehicles(userId?: string): Promise<Vehicle[]> {
    const { client } = await this.getHandles();
    let query = `SELECT * FROM vehicles`;
    const args: any[] = [];

    if (userId) {
      query += ` WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC`;
      args.push(userId);
    } else {
      query += ` ORDER BY created_at DESC`;
    }

    const res = await client.execute({ sql: query, args });
    return res.rows.map((r: any) => {
      let specs = null;
      if (r.specs) {
        try {
          specs = JSON.parse(r.specs);
        } catch {}
      }
      return vehicleSchema.parse({
        id: r.id,
        userId: r.user_id || null,
        name: r.name,
        make: r.make,
        model: r.model,
        year: Number(r.year),
        licensePlate: r.license_plate,
        initialOdometer: Number(r.initial_odometer),
        currentOdometer: Number(r.current_odometer),
        recommendedOil: r.recommended_oil,
        specs,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    });
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

  async updateMaintenanceSchedule(
    id: string,
    data: Partial<Pick<MaintenanceSchedule, 'lastDoneOdometer' | 'lastDoneDate' | 'intervalKm' | 'intervalMonths'>>
  ): Promise<void> {
    const { client } = await this.getHandles();
    const sets: string[] = [];
    const args: any[] = [];
    if (data.lastDoneOdometer !== undefined) {
      sets.push('last_done_odometer = ?');
      args.push(data.lastDoneOdometer);
    }
    if (data.lastDoneDate !== undefined) {
      sets.push('last_done_date = ?');
      args.push(data.lastDoneDate);
    }
    if (data.intervalKm !== undefined) {
      sets.push('interval_km = ?');
      args.push(data.intervalKm);
    }
    if (data.intervalMonths !== undefined) {
      sets.push('interval_months = ?');
      args.push(data.intervalMonths);
    }
    if (sets.length === 0) return;
    args.push(id);
    await client.execute({
      sql: `UPDATE maintenance_schedules SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });
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

  // Global Vehicle Specifications & Schedules Cache
  async getGlobalSpecCache(make: string, model: string, year: number): Promise<{
    id: string;
    specs: any;
    schedules: any | null;
    recommendedOil: string | null;
    source: string;
    hitCount: number;
  } | null> {
    const { client } = await this.getHandles();
    const makeNorm = make.trim().toLowerCase();
    const modelNorm = model.trim().toLowerCase();

    const result = await client.execute({
      sql: `SELECT id, specs_json, schedules_json, recommended_oil, source, hit_count 
            FROM global_vehicle_specs_cache 
            WHERE make_normalized = ? AND model_normalized = ? AND year = ? 
            LIMIT 1`,
      args: [makeNorm, modelNorm, year],
    });

    if (result.rows.length === 0) return null;
    const row = result.rows[0];

    // Async increment hit count in background
    client.execute({
      sql: `UPDATE global_vehicle_specs_cache SET hit_count = hit_count + 1 WHERE id = ?`,
      args: [row.id as string],
    }).catch(() => {});

    let specs = null;
    let schedules = null;
    try {
      specs = JSON.parse(row.specs_json as string);
    } catch {}
    if (row.schedules_json) {
      try {
        schedules = JSON.parse(row.schedules_json as string);
      } catch {}
    }

    return {
      id: row.id as string,
      specs,
      schedules,
      recommendedOil: (row.recommended_oil as string) || null,
      source: (row.source as string) || 'server_gemini',
      hitCount: Number(row.hit_count) || 1,
    };
  }

  async saveGlobalSpecCache(
    make: string,
    model: string,
    year: number,
    specs: any,
    schedules?: any,
    recommendedOil?: string,
    source = 'server_gemini'
  ): Promise<void> {
    const { client } = await this.getHandles();
    const id = crypto.randomUUID();
    const makeNorm = make.trim().toLowerCase();
    const modelNorm = model.trim().toLowerCase();
    const now = new Date().toISOString();
    const specsJson = typeof specs === 'string' ? specs : JSON.stringify(specs);
    const schedulesJson = schedules ? (typeof schedules === 'string' ? schedules : JSON.stringify(schedules)) : null;

    await client.execute({
      sql: `INSERT INTO global_vehicle_specs_cache (
              id, make_normalized, model_normalized, year, specs_json, schedules_json, recommended_oil, source, created_at, hit_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(make_normalized, model_normalized, year) DO UPDATE SET 
              specs_json = excluded.specs_json,
              schedules_json = COALESCE(excluded.schedules_json, global_vehicle_specs_cache.schedules_json),
              recommended_oil = COALESCE(excluded.recommended_oil, global_vehicle_specs_cache.recommended_oil),
              source = excluded.source`,
      args: [id, makeNorm, modelNorm, year, specsJson, schedulesJson, recommendedOil || null, source, now],
    });
  }

  async close() {
    const { client } = await this.getHandles();
    client.close();
  }
}
