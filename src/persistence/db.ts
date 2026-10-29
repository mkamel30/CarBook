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
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      picture TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL,
      is_guest INTEGER NOT NULL DEFAULT 0
    );`,
    `CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      license_plate TEXT,
      initial_odometer REAL NOT NULL DEFAULT 0,
      current_odometer REAL NOT NULL DEFAULT 0,
      recommended_oil TEXT,
      specs TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      rev INTEGER NOT NULL DEFAULT 0,
      seq INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0,
      sync_ts INTEGER NOT NULL DEFAULT 0
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
      last_done_date TEXT,
      rev INTEGER NOT NULL DEFAULT 0,
      seq INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0,
      sync_ts INTEGER NOT NULL DEFAULT 0
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
      created_at TEXT NOT NULL,
      rev INTEGER NOT NULL DEFAULT 0,
      seq INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0,
      sync_ts INTEGER NOT NULL DEFAULT 0
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
      created_at TEXT NOT NULL,
      rev INTEGER NOT NULL DEFAULT 0,
      seq INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0,
      sync_ts INTEGER NOT NULL DEFAULT 0
    );`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      is_encrypted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS global_vehicle_specs_cache (
      id TEXT PRIMARY KEY,
      make_normalized TEXT NOT NULL,
      model_normalized TEXT NOT NULL,
      year INTEGER NOT NULL,
      specs_json TEXT NOT NULL,
      schedules_json TEXT,
      recommended_oil TEXT,
      source TEXT NOT NULL DEFAULT 'server_gemini',
      created_at TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 1,
      UNIQUE(make_normalized, model_normalized, year)
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_specs_cache_lookup 
    ON global_vehicle_specs_cache(make_normalized, model_normalized, year);`,
    // Global monotonic op counter used to assign sync `seq` for cursor-based pull.
    `CREATE TABLE IF NOT EXISTS sync_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      value INTEGER NOT NULL DEFAULT 0
    );`,
    `INSERT OR IGNORE INTO sync_counter (id, value) VALUES (1, 0);`,
    `CREATE INDEX IF NOT EXISTS idx_vehicles_seq ON vehicles(seq);`,
    `CREATE INDEX IF NOT EXISTS idx_schedules_seq ON maintenance_schedules(seq);`,
    `CREATE INDEX IF NOT EXISTS idx_logs_seq ON maintenance_logs(seq);`,
    `CREATE INDEX IF NOT EXISTS idx_fuel_seq ON fuel_logs(seq);`,
    // One row per signed-in device, so a phone login never signs the desktop out.
    // Only the SHA-256 of the refresh token is stored; the token itself is never persisted.
    // Rotated rows are kept with revoked_at set: replaying one is the signal that the
    // token was copied, so it must stay distinguishable from a token never seen before.
    `CREATE TABLE IF NOT EXISTS device_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      refresh_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      revoked_at TEXT
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_device_sessions_hash ON device_sessions(refresh_hash);`,
    `CREATE INDEX IF NOT EXISTS idx_device_sessions_user ON device_sessions(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_device_sessions_device ON device_sessions(user_id, device_id);`
  ], 'write');

  const db = drizzle(client, { schema });

  // Safe migration for existing databases: ensure parts_list and specs columns exist
  try {
    await client.execute('ALTER TABLE maintenance_logs ADD COLUMN parts_list TEXT;');
  } catch (e) {
    // Column already exists or table was just created
  }
  try {
    await client.execute('ALTER TABLE vehicles ADD COLUMN specs TEXT;');
  } catch (e) {
    // Column already exists or table was just created
  }
  try {
    await client.execute('ALTER TABLE vehicles ADD COLUMN user_id TEXT;');
  } catch (e) {
    // Column already exists or table was just created
  }
  try {
    await client.execute('CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);');
  } catch (e) {}
  try {
    await client.execute('ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0;');
  } catch (e) {
    // Column already exists or table was just created
  }

  // Sync columns for pre-existing databases (new databases get them via CREATE above).
  const syncTables = ['vehicles', 'maintenance_schedules', 'maintenance_logs', 'fuel_logs'];
  for (const t of syncTables) {
    try { await client.execute(`ALTER TABLE ${t} ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;`); } catch (e) {}
    try { await client.execute(`ALTER TABLE ${t} ADD COLUMN seq INTEGER;`); } catch (e) {}
    try { await client.execute(`ALTER TABLE ${t} ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;`); } catch (e) {}
    try { await client.execute(`ALTER TABLE ${t} ADD COLUMN sync_ts INTEGER NOT NULL DEFAULT 0;`); } catch (e) {}
    try { await client.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_seq ON ${t}(seq);`); } catch (e) {}
  }

  // Backfill seq for rows that predate sync so the first client pull (since=0) receives them.
  for (const t of syncTables) {
    try {
      const res = await client.execute({ sql: `SELECT COUNT(*) AS c FROM ${t} WHERE seq IS NULL`, args: [] });
      const pending = Number((res.rows[0] as any).c || 0);
      if (pending > 0) {
        await client.batch([
          { sql: `UPDATE sync_counter SET value = value + ? WHERE id = 1;`, args: [pending] },
          { sql: `WITH bump AS (SELECT value AS hi FROM sync_counter WHERE id = 1),
                   ranked AS (SELECT id, hi - (COUNT(*) OVER (ORDER BY rowid) - 1) AS s
                              FROM ${t} CROSS JOIN bump WHERE seq IS NULL)
                  UPDATE ${t} SET seq = (SELECT s FROM ranked WHERE ranked.id = ${t}.id),
                                  rev = MAX(rev, 1),
                                  sync_ts = COALESCE(NULLIF(sync_ts, 0), 0);`, args: [] },
        ], 'write');
      }
    } catch (e) {}
  }

  if (!dbFilePath) {
    _db = db;
    _client = client;
  }

  return { db, client };
}
