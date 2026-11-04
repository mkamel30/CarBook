import { getDatabase } from './db';
import { reserveSeq } from './sync';
import * as schema from './schema';
import { eq, desc, and } from 'drizzle-orm';
import { planScheduleLinking } from '../domain/schedulesCore';
import { touchedGroups } from '../sync/fieldGroups';
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

/** Tables that can be resolved to the owning user, directly or through their vehicle. */
export type OwnedTable = 'vehicles' | 'fuel_logs' | 'maintenance_logs' | 'maintenance_schedules';

const OWNED_TABLES: ReadonlySet<string> = new Set<OwnedTable>([
  'vehicles',
  'fuel_logs',
  'maintenance_logs',
  'maintenance_schedules',
]);

/**
 * The server encoding of the odometer rule in domain/schedulesCore.ts
 * (computeMaxOdometer): current_odometer is the max of the vehicle's initial
 * odometer and every LIVE fuel/maintenance reading. It is a single SQL statement
 * so the log write and the odometer move commit in one transaction; the conformance
 * suite (tests/schedulesConformance.server.test.ts) proves it agrees with the pure
 * rule the device uses. Arg order: vehicle id ×3, then updated_at, seq, sync_ts, id.
 */
const RECALCULATE_ODOMETER_SQL = `UPDATE vehicles
  SET current_odometer = (
    SELECT MAX(odo) FROM (
      SELECT initial_odometer AS odo FROM vehicles WHERE id = ?
      UNION ALL
      SELECT odometer AS odo FROM fuel_logs WHERE vehicle_id = ? AND deleted = 0
      UNION ALL
      SELECT odometer AS odo FROM maintenance_logs WHERE vehicle_id = ? AND deleted = 0
    )
  ),
  updated_at = ?, rev = rev + 1, seq = ?, sync_ts = ?
  WHERE id = ?`;

/**
 * The insert-side shortcut of the same rule: a brand-new log can only raise the
 * odometer, so MAX(current, ?) is the recompute restricted to one reading.
 * Arg order: odometer, updated_at, seq, sync_ts, vehicle id.
 */
const PUSH_ODOMETER_MAX_SQL = `UPDATE vehicles SET current_odometer = MAX(current_odometer, ?), updated_at = ?, rev = rev + 1, seq = ?, sync_ts = ? WHERE id = ?`;

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

      // Claim legacy/unassigned vehicles for mkamel30@gmail.com
      if (profile.email.toLowerCase() === 'mkamel30@gmail.com') {
        await client.execute({
          sql: `UPDATE vehicles SET user_id = ? WHERE user_id IS NULL OR user_id = 'default'`,
          args: [user.id as string],
        });
      }

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
    const { client } = await this.getHandles();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const ts = Date.now();
    const validated = vehicleSchema.parse({
      ...data,
      id,
      userId: userId || data.userId || null,
      createdAt: now,
      updatedAt: now,
    });

    // Every sync-visible mutation reserves a fresh global seq so other devices
    // receive the row on their next pull (same pattern as backup.ts / sync push).
    const seq = await reserveSeq(client, 1);
    await client.execute({
      sql: `INSERT INTO vehicles (id, user_id, name, make, model, year, engine_cc, license_plate,
              initial_odometer, current_odometer, recommended_oil, specs, created_at, updated_at,
              rev, seq, deleted, sync_ts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?)`,
      args: [
        validated.id!,
        validated.userId || null,
        validated.name,
        validated.make,
        validated.model,
        validated.year,
        validated.engineCc || null,
        validated.licensePlate ?? null,
        validated.initialOdometer,
        validated.currentOdometer,
        validated.recommendedOil ?? null,
        validated.specs ? JSON.stringify(validated.specs) : null,
        validated.createdAt!,
        validated.updatedAt!,
        seq,
        ts,
      ],
    });

    return validated;
  }

  async updateVehicleSpecs(vehicleId: string, specs: any): Promise<void> {
    const { client } = await this.getHandles();
    const now = new Date().toISOString();
    const seq = await reserveSeq(client, 1);
    await client.execute({
      sql: `UPDATE vehicles SET specs = ?, updated_at = ?, rev = rev + 1, seq = ?, sync_ts = ? WHERE id = ?`,
      args: [JSON.stringify(specs), now, seq, Date.now(), vehicleId],
    });
  }

  // Ownership
  /**
   * The user id that owns a record: directly for a vehicle, through its parent
   * vehicle otherwise. Rows that belong to nobody (un-claimed legacy data) and
   * unknown ids both resolve to null, so callers fail closed.
   */
  async ownerOf(table: OwnedTable, id: string): Promise<string | null> {
    if (!id || !OWNED_TABLES.has(table)) return null;
    const { client } = await this.getHandles();
    const res =
      table === 'vehicles'
        ? await client.execute({ sql: 'SELECT user_id FROM vehicles WHERE id = ?', args: [id] })
        : await client.execute({
            sql: `SELECT v.user_id AS user_id FROM ${table} t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = ?`,
            args: [id],
          });
    const row = res.rows[0] as any;
    if (!row) return null;
    return row.user_id === null || row.user_id === undefined ? null : String(row.user_id);
  }

  async getVehicleById(id: string, userId?: string): Promise<Vehicle | null> {
    // An absent caller identity means "anonymous", never "match the unassigned rows":
    // otherwise any request could read a legacy vehicle and all of its logs.
    if (!userId) return null;
    const { client } = await this.getHandles();
    const res = await client.execute({
      sql: `SELECT * FROM vehicles WHERE id = ? AND user_id = ? AND (deleted = 0 OR deleted IS NULL)`,
      args: [id, userId],
    });
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
      engineCc: r.engine_cc || null,
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
    if (!userId) {
      // Anonymous / unauthenticated: never expose private data on the server
      return [];
    }

    const query = `SELECT * FROM vehicles WHERE user_id = ? AND (deleted = 0 OR deleted IS NULL) ORDER BY created_at DESC`;
    const res = await client.execute({ sql: query, args: [userId] });
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
      engineCc: r.engine_cc || null,
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

  async updateVehicle(
    id: string,
    data: Partial<Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>>,
    userId?: string
  ): Promise<Vehicle> {
    const existing = await this.getVehicleById(id, userId);
    if (!existing) {
      throw new Error('Vehicle not found or unauthorized');
    }

    const { client } = await this.getHandles();
    const now = new Date().toISOString();
    const ts = Date.now();

    const merged = {
      ...existing,
      ...data,
      engineCc: data.engineCc !== undefined ? (data.engineCc || null) : existing.engineCc,
      updatedAt: now,
    };
    const validated = vehicleSchema.parse(merged);
    const specsJson = validated.specs ? JSON.stringify(validated.specs) : null;
    const seq = await reserveSeq(client, 1);

    await client.execute({
      sql: `UPDATE vehicles SET 
              name = ?, 
              make = ?, 
              model = ?, 
              year = ?, 
              engine_cc = ?, 
              license_plate = ?, 
              initial_odometer = ?,
              current_odometer = ?, 
              recommended_oil = ?, 
              specs = ?, 
              updated_at = ?,
              rev = rev + 1,
              seq = ?,
              sync_ts = ?
            WHERE id = ?`,
      args: [
        validated.name,
        validated.make,
        validated.model,
        validated.year,
        validated.engineCc || null,
        validated.licensePlate || null,
        validated.initialOdometer,
        validated.currentOdometer,
        validated.recommendedOil || null,
        specsJson,
        now,
        seq,
        ts,
        id,
      ],
    });

    return validated;
  }

  async deleteVehicle(id: string, userId?: string): Promise<void> {
    const existing = await this.getVehicleById(id, userId);
    if (!existing) {
      throw new Error('Vehicle not found or unauthorized');
    }

    const { client } = await this.getHandles();
    const now = new Date().toISOString();
    const ts = Date.now();

    // One fresh seq per tombstoned row (vehicle + all children) so every delete
    // is visible to other devices' pull cursors; hard deletes never propagate.
    const seqBase = await reserveSeq(client, 4);
    await client.batch(
      [
        {
          sql: `UPDATE vehicles SET deleted = 1, rev = rev + 1, seq = ?, sync_ts = ?, updated_at = ? WHERE id = ?`,
          args: [seqBase, ts, now, id],
        },
        {
          sql: `UPDATE fuel_logs SET deleted = 1, rev = rev + 1, seq = ?, sync_ts = ? WHERE vehicle_id = ? AND deleted = 0`,
          args: [seqBase + 1, ts, id],
        },
        {
          sql: `UPDATE maintenance_logs SET deleted = 1, rev = rev + 1, seq = ?, sync_ts = ? WHERE vehicle_id = ? AND deleted = 0`,
          args: [seqBase + 2, ts, id],
        },
        {
          sql: `UPDATE maintenance_schedules SET deleted = 1, rev = rev + 1, seq = ?, sync_ts = ? WHERE vehicle_id = ? AND deleted = 0`,
          args: [seqBase + 3, ts, id],
        },
      ],
      'write'
    );
  }

  // Maintenance Schedules
  async addMaintenanceSchedule(data: Omit<MaintenanceSchedule, 'id'>): Promise<MaintenanceSchedule> {
    const { client } = await this.getHandles();
    const id = crypto.randomUUID();
    const validated = maintenanceScheduleSchema.parse({ ...data, id });
    const seq = await reserveSeq(client, 1);
    const ts = Date.now();

    await client.execute({
      sql: `INSERT INTO maintenance_schedules (id, vehicle_id, item_code, title_ar, title_en, interval_km,
              interval_months, last_done_odometer, last_done_date, rev, seq, deleted, sync_ts, baseline_ts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?)`,
      args: [
        validated.id!,
        validated.vehicleId,
        validated.itemCode,
        validated.titleAr,
        validated.titleEn,
        validated.intervalKm,
        validated.intervalMonths ?? null,
        validated.lastDoneOdometer ?? null,
        validated.lastDoneDate ?? null,
        seq,
        ts,
        ts,
      ],
    });

    return validated;
  }

  async getSchedulesByVehicle(vehicleId: string): Promise<MaintenanceSchedule[]> {
    const { client } = await this.getHandles();
    const res = await client.execute({
      sql: `SELECT * FROM maintenance_schedules WHERE vehicle_id = ? AND deleted = 0`,
      args: [vehicleId],
    });

    return res.rows.map((r: any) => maintenanceScheduleSchema.parse({
      id: r.id,
      vehicleId: r.vehicle_id,
      itemCode: r.item_code,
      titleAr: r.title_ar,
      titleEn: r.title_en,
      intervalKm: r.interval_km,
      intervalMonths: r.interval_months,
      lastDoneOdometer: r.last_done_odometer,
      lastDoneDate: r.last_done_date,
    }));
  }

  async updateMaintenanceSchedule(
    id: string,
    data: Partial<Pick<MaintenanceSchedule, 'lastDoneOdometer' | 'lastDoneDate' | 'intervalKm' | 'intervalMonths'>>
  ): Promise<void> {
    const { client } = await this.getHandles();
    const sets: string[] = [];
    const args: any[] = [];
    const updatedColumns: string[] = [];
    const set = (column: string, value: any) => {
      sets.push(`${column} = ?`);
      args.push(value);
      updatedColumns.push(column);
    };
    if (data.lastDoneOdometer !== undefined) set('last_done_odometer', data.lastDoneOdometer);
    if (data.lastDoneDate !== undefined) set('last_done_date', data.lastDoneDate);
    if (data.intervalKm !== undefined) set('interval_km', data.intervalKm);
    if (data.intervalMonths !== undefined) set('interval_months', data.intervalMonths);
    if (sets.length === 0) return;
    // Stamp ONLY the field groups this write touched, mirroring the merge in
    // sync.ts: advancing a baseline must not claim a newer config, or a peer's
    // fresher interval edit gets dropped as stale on its next push.
    const seq = await reserveSeq(client, 1);
    const ts = Date.now();
    sets.push('rev = rev + 1');
    sets.push('seq = ?');
    args.push(seq);
    for (const group of touchedGroups('maintenance_schedules', updatedColumns)) {
      sets.push(`${group.tsColumn} = ?`);
      args.push(ts);
    }
    args.push(id);
    await client.execute({
      sql: `UPDATE maintenance_schedules SET ${sets.join(', ')} WHERE id = ?`,
      args,
    });
  }

  /**
   * Item codes this vehicle already has, INCLUDING tombstoned rows. The factory
   * preset seeding compares against this so a preset the owner deliberately
   * removed is not silently re-created on the next GET.
   */
  async getItemCodesByVehicle(vehicleId: string): Promise<string[]> {
    const { client } = await this.getHandles();
    const res = await client.execute({
      sql: `SELECT item_code FROM maintenance_schedules WHERE vehicle_id = ?`,
      args: [vehicleId],
    });
    return res.rows.map((r: any) => String(r.item_code));
  }

  /**
   * Soft-remove a schedule item. Tombstoned (never hard deleted) so other
   * devices receive the removal through their pull cursor instead of
   * resurrecting the row.
   */
  async deleteMaintenanceSchedule(id: string): Promise<void> {
    const { client } = await this.getHandles();
    const seq = await reserveSeq(client, 1);
    await client.execute({
      sql: `UPDATE maintenance_schedules SET deleted = 1, rev = rev + 1, seq = ?, sync_ts = ? WHERE id = ? AND deleted = 0`,
      args: [seq, Date.now(), id],
    });
  }

  /**
   * Drive the preventive schedule from recorded service — the server's storage
   * port for domain/schedulesCore.planScheduleLinking, which the offline bridge
   * runs over the same rows. This method only reads live rows and writes back
   * the patches the core chose; every candidate rule lives in the core.
   *
   * Returns the ids of the schedule rows it updated.
   */
  async linkSchedulesForItems(params: {
    vehicleId: string;
    itemCodes: string[];
    sourceLog?: { odometer: number; serviceDate: string } | null;
    explicitItemCode?: string | null;
  }): Promise<string[]> {
    const schedules = await this.getSchedulesByVehicle(params.vehicleId);
    if (schedules.length === 0) return [];

    const logs = await this.getMaintenanceLogsByVehicle(params.vehicleId);
    const patches = planScheduleLinking(schedules, logs, params);

    const updated: string[] = [];
    for (const patch of patches) {
      await this.updateMaintenanceSchedule(patch.schedule.id!, {
        lastDoneOdometer: patch.lastDoneOdometer,
        lastDoneDate: patch.lastDoneDate,
      });
      updated.push(patch.schedule.id!);
    }

    return updated;
  }

  // Fuel Logs with Transactional Atomic Odometer Sync
  async addFuelLog(data: Omit<FuelLog, 'id' | 'createdAt'>): Promise<FuelLog> {
    const { client, db } = await this.getHandles();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const ts = Date.now();
    const validated = fuelLogSchema.parse({ ...data, id, createdAt: now });

    // The new log and the vehicle whose odometer moves both need a fresh seq,
    // otherwise other devices never see this change until the next restart.
    const seqBase = await reserveSeq(client, 2);
    // Execute atomic batch transaction
    await client.batch([
      {
        sql: `INSERT INTO fuel_logs (id, vehicle_id, fill_date, odometer, liters, price_per_liter, total_cost, is_full_tank, notes, created_at, rev, seq, deleted, sync_ts)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?)`,
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
          seqBase,
          ts,
        ],
      },
      {
        sql: PUSH_ODOMETER_MAX_SQL,
        args: [validated.odometer, now, seqBase + 1, ts, validated.vehicleId],
      },
    ], 'write');

    return validated;
  }

  async getFuelLogsByVehicle(vehicleId: string): Promise<FuelLog[]> {
    const { db } = await this.getHandles();
    const records = await db.select()
      .from(schema.fuelLogsTable)
      .where(and(eq(schema.fuelLogsTable.vehicleId, vehicleId), eq(schema.fuelLogsTable.deleted, 0)))
      .orderBy(desc(schema.fuelLogsTable.odometer));

    return records.map(r => fuelLogSchema.parse({
      ...r,
      isFullTank: Boolean(r.isFullTank),
    }));
  }

  async updateFuelLog(id: string, data: Partial<Omit<FuelLog, 'id' | 'createdAt'>>): Promise<FuelLog> {
    const { client, db } = await this.getHandles();
    const existingRecords = await db.select().from(schema.fuelLogsTable)
      .where(and(eq(schema.fuelLogsTable.id, id), eq(schema.fuelLogsTable.deleted, 0)));
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
    const ts = Date.now();
    const seqBase = await reserveSeq(client, 2);

    await client.batch([
      {
        sql: `UPDATE fuel_logs
              SET fill_date = ?, odometer = ?, liters = ?, price_per_liter = ?, total_cost = ?, is_full_tank = ?, notes = ?,
                  rev = rev + 1, seq = ?, sync_ts = ?
              WHERE id = ?`,
        args: [
          validated.fillDate,
          validated.odometer,
          validated.liters,
          validated.pricePerLiter,
          validated.totalCost,
          validated.isFullTank ? 1 : 0,
          validated.notes || null,
          seqBase,
          ts,
          id,
        ],
      },
      {
        // Re-evaluate vehicle max odometer across fuel, maintenance, and initial odometer
        sql: RECALCULATE_ODOMETER_SQL,
        args: [validated.vehicleId, validated.vehicleId, validated.vehicleId, now, seqBase + 1, ts, validated.vehicleId],
      },
    ], 'write');

    return validated;
  }

  async deleteFuelLog(id: string): Promise<void> {
    const { client, db } = await this.getHandles();
    const existing = await db.select().from(schema.fuelLogsTable)
      .where(and(eq(schema.fuelLogsTable.id, id), eq(schema.fuelLogsTable.deleted, 0)));
    if (existing.length === 0) return;
    const vehicleId = existing[0].vehicleId;
    const now = new Date().toISOString();
    const ts = Date.now();

    // Tombstone instead of hard delete: other devices must receive the deletion
    // through their pull cursor instead of resurrecting the row later.
    // (fuel_logs has no updated_at column; sync_ts + seq carry the delete stamp.)
    const seqBase = await reserveSeq(client, 2);
    await client.batch([
      {
        sql: `UPDATE fuel_logs SET deleted = 1, rev = rev + 1, seq = ?, sync_ts = ? WHERE id = ?`,
        args: [seqBase, ts, id],
      },
      {
        sql: RECALCULATE_ODOMETER_SQL,
        args: [vehicleId, vehicleId, vehicleId, now, seqBase + 1, ts, vehicleId],
      },
    ], 'write');
  }

  // Maintenance Logs with Transactional Atomic Odometer Sync
  async addMaintenanceLog(data: Omit<MaintenanceLog, 'id' | 'createdAt'>): Promise<MaintenanceLog> {
    const { client } = await this.getHandles();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const ts = Date.now();
    const validated = maintenanceLogSchema.parse({ ...data, id, createdAt: now });

    const seqBase = await reserveSeq(client, 2);
    await client.batch([
      {
        sql: `INSERT INTO maintenance_logs (id, vehicle_id, service_date, odometer, service_type, title, parts_list, parts_cost, labor_cost, total_cost, workshop, notes, next_due_odometer, next_due_date, created_at, rev, seq, deleted, sync_ts)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?)`,
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
          seqBase,
          ts,
        ],
      },
      {
        sql: PUSH_ODOMETER_MAX_SQL,
        args: [validated.odometer, now, seqBase + 1, ts, validated.vehicleId],
      },
    ], 'write');

    return validated;
  }

  async updateMaintenanceLog(id: string, data: Partial<Omit<MaintenanceLog, 'id' | 'createdAt'>>): Promise<MaintenanceLog> {
    const { client, db } = await this.getHandles();
    const existingRecords = await db.select().from(schema.maintenanceLogsTable)
      .where(and(eq(schema.maintenanceLogsTable.id, id), eq(schema.maintenanceLogsTable.deleted, 0)));
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
    const ts = Date.now();
    const seqBase = await reserveSeq(client, 2);

    await client.batch([
      {
        sql: `UPDATE maintenance_logs
              SET service_date = ?, odometer = ?, service_type = ?, title = ?, parts_list = ?, parts_cost = ?, labor_cost = ?, total_cost = ?, workshop = ?, notes = ?, next_due_odometer = ?, next_due_date = ?,
                  rev = rev + 1, seq = ?, sync_ts = ?
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
          seqBase,
          ts,
          id,
        ],
      },
      {
        sql: RECALCULATE_ODOMETER_SQL,
        args: [validated.vehicleId, validated.vehicleId, validated.vehicleId, now, seqBase + 1, ts, validated.vehicleId],
      },
    ], 'write');

    return validated;
  }

  async deleteMaintenanceLog(id: string): Promise<MaintenanceLog | null> {
    const { client, db } = await this.getHandles();
    const existing = await db.select().from(schema.maintenanceLogsTable)
      .where(and(eq(schema.maintenanceLogsTable.id, id), eq(schema.maintenanceLogsTable.deleted, 0)));
    if (existing.length === 0) return null;
    const vehicleId = existing[0].vehicleId;
    const now = new Date().toISOString();
    const ts = Date.now();

    // Tombstone, not hard delete (see deleteFuelLog for rationale).
    const seqBase = await reserveSeq(client, 2);
    await client.batch([
      {
        sql: `UPDATE maintenance_logs SET deleted = 1, rev = rev + 1, seq = ?, sync_ts = ? WHERE id = ?`,
        args: [seqBase, ts, id],
      },
      {
        sql: RECALCULATE_ODOMETER_SQL,
        args: [vehicleId, vehicleId, vehicleId, now, seqBase + 1, ts, vehicleId],
      },
    ], 'write');

    // The caller (route) re-links the items this log evidenced, so returning the
    // removed row's identity is what keeps update/delete consistent with create.
    let partsList = null;
    if (existing[0].partsList) {
      try { partsList = JSON.parse(existing[0].partsList); } catch { /* keep null */ }
    }
    return maintenanceLogSchema.parse({ ...existing[0], partsList });
  }

  /**
   * One live maintenance log by id, or null. The maintenance route needs the
   * stored row BEFORE an edit/delete so it knows which vehicle and which
   * preventive items to re-link afterwards.
   */
  async getMaintenanceLogById(id: string): Promise<MaintenanceLog | null> {
    if (!id) return null;
    const { db } = await this.getHandles();
    const records = await db.select().from(schema.maintenanceLogsTable)
      .where(and(eq(schema.maintenanceLogsTable.id, id), eq(schema.maintenanceLogsTable.deleted, 0)));
    if (records.length === 0) return null;
    const r = records[0];
    let partsList = null;
    if (r.partsList) {
      try { partsList = JSON.parse(r.partsList); } catch { /* keep null */ }
    }
    return maintenanceLogSchema.parse({ ...r, partsList });
  }

  async getMaintenanceLogsByVehicle(vehicleId: string): Promise<MaintenanceLog[]> {
    const { db } = await this.getHandles();
    const records = await db.select()
      .from(schema.maintenanceLogsTable)
      .where(and(eq(schema.maintenanceLogsTable.vehicleId, vehicleId), eq(schema.maintenanceLogsTable.deleted, 0)))
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

  // App Settings — keyed per user. An empty userId writes/reads the global
  // (legacy default) row; per-user rows fall back to it when absent.
  // NOTE: values are stored plaintext-at-rest; is_encrypted is recorded truthfully
  // as false — nothing in this codebase encrypts app_settings, and overstating
  // it on the column was misleading.
  async setSetting(key: string, value: string, isEncrypted = false, userId = ''): Promise<void> {
    const { client } = await this.getHandles();
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO app_settings (key, value, is_encrypted, updated_at, user_id)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(key, user_id) DO UPDATE SET value = excluded.value, is_encrypted = excluded.is_encrypted, updated_at = excluded.updated_at`,
      args: [key, value, isEncrypted ? 1 : 0, now, userId],
    });
  }

  async getSetting(key: string, userId?: string): Promise<string | null> {
    const { client } = await this.getHandles();
    if (userId) {
      // The user's own row wins; the global ('') row remains the legacy fallback.
      const res = await client.execute({
        sql: `SELECT value FROM app_settings
              WHERE key = ? AND (user_id = ? OR user_id = '')
              ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END LIMIT 1`,
        args: [key, userId, userId],
      });
      return res.rows.length > 0 ? (res.rows[0] as any).value as string : null;
    }
    const res = await client.execute({
      sql: `SELECT value FROM app_settings WHERE key = ? AND user_id = '' LIMIT 1`,
      args: [key],
    });
    return res.rows.length > 0 ? (res.rows[0] as any).value as string : null;
  }

  // Global Vehicle Specifications & Schedules Cache.
  // Rows with owner_user_id = '' are the shared official/seeded catalog and serve
  // every caller; rows saved with an owner (AI-derived per user) are only ever
  // returned to that owner, and take priority over the global row for them.
  async getGlobalSpecCache(make: string, model: string, year: number, userId?: string): Promise<{
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
              AND (owner_user_id = '' OR owner_user_id = ?)
            ORDER BY CASE WHEN owner_user_id = ? AND owner_user_id != '' THEN 0 ELSE 1 END
            LIMIT 1`,
      args: [makeNorm, modelNorm, year, userId || '', userId || ''],
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
    // A schedule-only write has no specs to store; treat the empty object as
    // absent so a later manual lookup regenerates instead of serving nothing.
    if (specs && typeof specs === 'object' && Object.keys(specs).length === 0) specs = null;
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
    source = 'server_gemini',
    userId = ''
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
              id, make_normalized, model_normalized, year, specs_json, schedules_json, recommended_oil, source, created_at, hit_count, owner_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(make_normalized, model_normalized, year, owner_user_id) DO UPDATE SET 
              specs_json = excluded.specs_json,
              schedules_json = COALESCE(excluded.schedules_json, global_vehicle_specs_cache.schedules_json),
              recommended_oil = COALESCE(excluded.recommended_oil, global_vehicle_specs_cache.recommended_oil),
              source = excluded.source`,
      args: [id, makeNorm, modelNorm, year, specsJson, schedulesJson, recommendedOil || null, source, now, userId],
    });
  }

  async close() {
    const { client } = await this.getHandles();
    client.close();
  }
}
