import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: Client | null = null;

export async function getDatabase(dbFilePath?: string) {
  if (_db && !dbFilePath) {
    return { db: _db, client: _client! };
  }

  const resolvedPath = dbFilePath || path.resolve(process.cwd(), 'car_maintenance.db');
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const fileUrl = `file:${resolvedPath.replace(/\\/g, '/')}`;
  const client = createClient({ url: fileUrl });

  // Initialize schema tables
  await client.batch([
    `CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      license_plate TEXT,
      initial_odometer REAL NOT NULL DEFAULT 0,
      current_odometer REAL NOT NULL DEFAULT 0,
      recommended_oil TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS maintenance_schedules (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      item_code TEXT NOT NULL,
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      interval_km REAL NOT NULL,
      interval_months INTEGER,
      last_done_odometer REAL,
      last_done_date TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS maintenance_logs (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      service_date TEXT NOT NULL,
      odometer REAL NOT NULL,
      service_type TEXT NOT NULL,
      title TEXT NOT NULL,
      parts_list TEXT,
      parts_cost REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL,
      workshop TEXT,
      notes TEXT,
      next_due_odometer REAL,
      next_due_date TEXT,
      created_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS fuel_logs (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      fill_date TEXT NOT NULL,
      odometer REAL NOT NULL,
      liters REAL NOT NULL,
      price_per_liter REAL NOT NULL,
      total_cost REAL NOT NULL,
      is_full_tank INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      is_encrypted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );`
  ], 'write');

  const db = drizzle(client, { schema });

  // Safe migration for existing databases: ensure parts_list column exists
  try {
    await client.execute('ALTER TABLE maintenance_logs ADD COLUMN parts_list TEXT;');
  } catch (e) {
    // Column already exists or table was just created
  }

  if (!dbFilePath) {
    _db = db;
    _client = client;
  }

  return { db, client };
}
