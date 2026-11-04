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

  // CARBOOK_DB_PATH lets a deployment point the store at its own data directory
  // (and lets the route tests run against a throwaway file).
  const resolvedPath =
    dbFilePath || process.env.CARBOOK_DB_PATH || path.resolve(process.cwd(), 'car_maintenance.db');
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
      engine_cc TEXT,
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
      sync_ts INTEGER NOT NULL DEFAULT 0,
      baseline_ts INTEGER NOT NULL DEFAULT 0
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
    // Per-user settings: user_id '' means a global (legacy/default) row.
    // (key, user_id) is the composite primary key so two users can hold the
    // same key. Legacy single-key rows are migrated into user_id = ''.
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      is_encrypted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (key, user_id)
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
      owner_user_id TEXT NOT NULL DEFAULT '',
      UNIQUE(make_normalized, model_normalized, year, owner_user_id)
    );`,
    // Global monotonic op counter used to assign sync `seq` for cursor-based pull.
    `CREATE TABLE IF NOT EXISTS sync_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      value INTEGER NOT NULL DEFAULT 0
    );`,
    `INSERT OR IGNORE INTO sync_counter (id, value) VALUES (1, 0);`,
    // The `seq` indexes are NOT created here: on a database that predates sync the
    // tables already exist without a `seq` column, so indexing it in this batch
    // would abort the whole migration. They are created after the ALTER loop below.
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
  } catch (e) {}
  try {
    await client.execute('ALTER TABLE vehicles ADD COLUMN engine_cc TEXT;');
  } catch (e) {}
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

  // One-time OAuth handoff codes for the mobile deep link. The raw code is
  // returned to the app once and never stored; only SHA-256(code) is kept, keyed
  // by that hash, so a database dump cannot be replayed for a session. Codes are
  // short-lived and single-use (used flips to 1 on redemption).
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS auth_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      exp INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );`);
  } catch (e) {
    // Table already exists
  }
  try {
    await client.execute('CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_codes(user_id);');
  } catch (e) {}

  // Server-side revocation list for web session JWTs (T6). Only tokens minted
  // with a `jti` claim can appear here; verifySessionToken consults it only
  // when a jti is present, so legacy jti-less tokens keep verifying normally.
  // `exp` mirrors the revoked token's own expiry so old rows can be GC'd once
  // the revocation can no longer matter.
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS revocations (
      jti TEXT PRIMARY KEY,
      exp INTEGER NOT NULL
    );`);
  } catch (e) {
    // Table already exists
  }
  try {
    await client.execute('CREATE INDEX IF NOT EXISTS idx_revocations_exp ON revocations(exp);');
  } catch (e) {}

  // Sync columns for pre-existing databases (new databases get them via CREATE above).
  const syncTables = ['vehicles', 'maintenance_schedules', 'maintenance_logs', 'fuel_logs'];
  for (const t of syncTables) {
    try { await client.execute(`ALTER TABLE ${t} ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;`); } catch (e) {}
    try { await client.execute(`ALTER TABLE ${t} ADD COLUMN seq INTEGER;`); } catch (e) {}
    try { await client.execute(`ALTER TABLE ${t} ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;`); } catch (e) {}
    try { await client.execute(`ALTER TABLE ${t} ADD COLUMN sync_ts INTEGER NOT NULL DEFAULT 0;`); } catch (e) {}
    try { await client.execute(`CREATE INDEX IF NOT EXISTS idx_${t}_seq ON ${t}(seq);`); } catch (e) {}
  }

  // Per-field-group last-write-wins for maintenance_schedules: the service
  // baseline (last_done_odometer / last_done_date) gets its own clock so an
  // interval edit and a log-link advance stop overwriting each other. Seeding it
  // from sync_ts keeps an upgraded database behaving as it did while both groups
  // shared one stamp — an old client's stale baseline cannot land over a new one.
  try { await client.execute(`ALTER TABLE maintenance_schedules ADD COLUMN baseline_ts INTEGER NOT NULL DEFAULT 0;`); } catch (e) {}
  try { await client.execute(`UPDATE maintenance_schedules SET baseline_ts = sync_ts WHERE baseline_ts = 0 AND sync_ts <> 0;`); } catch (e) {}

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

  // Per-user app_settings migration: legacy databases have `key TEXT PRIMARY KEY`
  // with no user_id. Add the column, then rebuild with (key, user_id) as the
  // composite key. Legacy rows become global defaults (user_id = ''), which stay
  // readable as fallback for every user (additive, backward compatible).
  try {
    await client.execute(`ALTER TABLE app_settings ADD COLUMN user_id TEXT;`);
  } catch (e) {}
  try {
    const shape = await client.execute({
      sql: `SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'app_settings' AND sql LIKE '%PRIMARY KEY (key, user_id)%'`,
      args: [],
    });
    if (Number((shape.rows[0] as any).c || 0) === 0) {
      await client.batch([
        { sql: `CREATE TABLE app_settings_new (
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            is_encrypted INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            user_id TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (key, user_id)
          );`, args: [] },
        { sql: `INSERT OR IGNORE INTO app_settings_new (key, value, is_encrypted, updated_at, user_id)
                SELECT key, value, is_encrypted, updated_at, COALESCE(user_id, '') FROM app_settings;`, args: [] },
        { sql: `DROP TABLE app_settings;`, args: [] },
        { sql: `ALTER TABLE app_settings_new RENAME TO app_settings;`, args: [] },
      ], 'write');
    }
  } catch (e) {}

  // Spec-cache per-owner migration: legacy table is globally unique on
  // (make, model, year) with no owner column. Rebuild so 'ai'-derived rows can be
  // scoped to their owner while official/seeded rows (owner_user_id = '') stay global.
  try {
    const shape = await client.execute({
      sql: `SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'global_vehicle_specs_cache' AND sql LIKE '%UNIQUE(make_normalized, model_normalized, year, owner_user_id)%'`,
      args: [],
    });
    if (Number((shape.rows[0] as any).c || 0) === 0) {
      try { await client.execute('ALTER TABLE global_vehicle_specs_cache ADD COLUMN owner_user_id TEXT;'); } catch (e) {}
      await client.batch([
        { sql: `CREATE TABLE global_vehicle_specs_cache_new (
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
            owner_user_id TEXT NOT NULL DEFAULT '',
            UNIQUE(make_normalized, model_normalized, year, owner_user_id)
          );`, args: [] },
        { sql: `INSERT OR IGNORE INTO global_vehicle_specs_cache_new
                  (id, make_normalized, model_normalized, year, specs_json, schedules_json, recommended_oil, source, created_at, hit_count, owner_user_id)
                SELECT id, make_normalized, model_normalized, year, specs_json, schedules_json, recommended_oil, source, created_at, hit_count, COALESCE(owner_user_id, '')
                FROM global_vehicle_specs_cache;`, args: [] },
        { sql: `DROP TABLE global_vehicle_specs_cache;`, args: [] },
        { sql: `ALTER TABLE global_vehicle_specs_cache_new RENAME TO global_vehicle_specs_cache;`, args: [] },
      ], 'write');
    }
  } catch (e) {}

  if (!dbFilePath) {
    _db = db;
    _client = client;
  }

  return { db, client };
}
