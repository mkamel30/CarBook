import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@libsql/client';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDatabase } from '@/persistence/db';

/**
 * Regression guard for the startup-migration ordering bug.
 *
 * The startup `client.batch(..., 'write')` used to create the `idx_<table>_seq`
 * indexes in the same statement block that creates the tables. On a database
 * written before the sync feature, `CREATE TABLE IF NOT EXISTS` is a no-op, the
 * tables therefore have no `seq` column yet, and indexing it made the whole
 * batch throw — which aborted every later migration step (device_sessions,
 * revocations, the ALTER loop, the app_settings rebuild) and left the app
 * failing with "no such column: seq". The indexes belong after the ALTER loop.
 */
const dbPath = path.join(
  os.tmpdir(),
  `carbook_legacysync_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
);

const SYNC_TABLES = ['vehicles', 'maintenance_schedules', 'maintenance_logs', 'fuel_logs'];

/** Pre-sync schema: no rev/seq/deleted/sync_ts, no users.is_guest, no parts_list,
 *  app_settings keyed on `key` alone, spec cache globally unique. */
const LEGACY_SCHEMA = [
  `CREATE TABLE users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, picture TEXT,
    created_at TEXT NOT NULL, last_login_at TEXT NOT NULL);`,
  `CREATE TABLE vehicles (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, make TEXT NOT NULL, model TEXT NOT NULL,
    year INTEGER NOT NULL, engine_cc TEXT, license_plate TEXT,
    initial_odometer REAL NOT NULL DEFAULT 0, current_odometer REAL NOT NULL DEFAULT 0,
    recommended_oil TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,
  `CREATE TABLE maintenance_schedules (
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL, title_ar TEXT NOT NULL, title_en TEXT NOT NULL,
    interval_km REAL NOT NULL, interval_months INTEGER, last_done_odometer REAL,
    last_done_date TEXT);`,
  `CREATE TABLE maintenance_logs (
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    service_date TEXT NOT NULL, odometer REAL NOT NULL, service_type TEXT NOT NULL,
    title TEXT NOT NULL, parts_cost REAL NOT NULL DEFAULT 0, labor_cost REAL NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL, workshop TEXT, notes TEXT, next_due_odometer REAL,
    next_due_date TEXT, created_at TEXT NOT NULL);`,
  `CREATE TABLE fuel_logs (
    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    fill_date TEXT NOT NULL, odometer REAL NOT NULL, liters REAL NOT NULL,
    price_per_liter REAL NOT NULL, total_cost REAL NOT NULL, is_full_tank INTEGER NOT NULL DEFAULT 1,
    notes TEXT, created_at TEXT NOT NULL);`,
  `CREATE TABLE app_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, is_encrypted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL);`,
  `CREATE TABLE global_vehicle_specs_cache (
    id TEXT PRIMARY KEY, make_normalized TEXT NOT NULL, model_normalized TEXT NOT NULL,
    year INTEGER NOT NULL, specs_json TEXT NOT NULL, schedules_json TEXT, recommended_oil TEXT,
    source TEXT NOT NULL DEFAULT 'server_gemini', created_at TEXT NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(make_normalized, model_normalized, year));`,
];

/** 2 vehicles + 3 schedules + 2 logs + 1 fuel log = 8 rows that need a seq. */
const LEGACY_ROWS = [
  `INSERT INTO users VALUES ('legacy-owner','legacy@example.com','Legacy Owner',NULL,'2026-01-01','2026-01-01');`,
  `INSERT INTO vehicles VALUES ('v-1','Chevy','Chevrolet','Cruze',2018,'1600','AB-1',120000,150000,'5W-30','2026-01-01','2026-01-01');`,
  `INSERT INTO vehicles VALUES ('v-2','Corolla','Toyota','Corolla',2021,'1800','CD-2',80000,95000,'0W-20','2026-01-01','2026-01-01');`,
  `INSERT INTO maintenance_schedules VALUES ('s-1','v-1','engine_oil_filter','زيت','Oil',10000,6,140000,'2026-01-01');`,
  `INSERT INTO maintenance_schedules VALUES ('s-2','v-1','air_filter','فلتر','Air filter',20000,12,NULL,NULL);`,
  `INSERT INTO maintenance_schedules VALUES ('s-3','v-2','brake_pads','تيل','Brakes',30000,18,NULL,NULL);`,
  `INSERT INTO maintenance_logs VALUES ('m-1','v-1','2026-01-01',140000,'oil','Oil change',400,100,500,'Nasser','',NULL,NULL,'2026-01-01');`,
  `INSERT INTO maintenance_logs VALUES ('m-2','v-2','2026-01-01',90000,'filter','Air filter',120,30,150,'Nasser','',NULL,NULL,'2026-01-01');`,
  `INSERT INTO fuel_logs VALUES ('f-1','v-1','2026-01-01',150100,40,9.4,376,1,'','2026-01-01');`,
  `INSERT INTO app_settings VALUES ('currency','EGP',0,'2026-01-01');`,
  `INSERT INTO global_vehicle_specs_cache
     VALUES ('c-1','chevrolet','cruze',2018,'{}',NULL,'5W-30','official','2026-01-01',1);`,
];

const LEGACY_ROW_COUNT = 8;

const columnsOf = async (client: any, table: string) => {
  const res = await client.execute({ sql: `SELECT * FROM pragma_table_info(?)`, args: [table] });
  return res.rows.map((r: any) => String(r.name));
};

const indexNames = async (client: any, table: string) => {
  const res = await client.execute({ sql: `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=?`, args: [table] });
  return res.rows.map((r: any) => String(r.name));
};

const countNullSeq = async (client: any, table: string) => {
  const res = await client.execute({ sql: `SELECT COUNT(*) AS c FROM ${table} WHERE seq IS NULL`, args: [] });
  return Number((res.rows[0] as any).c);
};

describe('startup migration of a pre-sync database', () => {
  let client: any;

  // Seeding a real SQLite file plus the full migration is slow on Windows fsync,
  // so both hooks get an explicit budget instead of the 10s default.
  beforeAll(async () => {
    if (fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
    }
    const seed = createClient({ url: `file:${dbPath.replace(/\\/g, '/')}` });
    for (const sql of [...LEGACY_SCHEMA, ...LEGACY_ROWS]) await seed.execute(sql);
    await seed.close();

    // The migration under test: before the fix this rejected outright.
    ({ client } = await getDatabase(dbPath));
  }, 120_000);

  afterAll(async () => {
    try { await client.close(); } catch { /* ignore */ }
    for (const ext of ['', '-wal', '-shm']) {
      try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
    }
  }, 60_000);

  it('completes instead of aborting on the missing seq column', async () => {
    // A batch that throws kills getDatabase, so reaching here is the primary
    // assertion; these tables only exist because the steps after the batch ran.
    for (const table of ['device_sessions', 'auth_codes', 'revocations']) {
      const res = await client.execute({
        sql: `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name=?`,
        args: [table],
      });
      expect(Number((res.rows[0] as any).c), table).toBe(1);
    }
  });

  it.each(SYNC_TABLES)('adds the sync columns and the seq index to %s', async (table) => {
    const cols = await columnsOf(client, table);
    for (const col of ['rev', 'seq', 'deleted', 'sync_ts']) expect(cols, col).toContain(col);
    expect(await indexNames(client, table)).toContain(`idx_${table}_seq`);
  });

  it('backfills seq so a first client pull (since=0) receives the legacy rows', async () => {
    for (const table of SYNC_TABLES) expect(await countNullSeq(client, table), table).toBe(0);
    const res = await client.execute({ sql: `SELECT value FROM sync_counter WHERE id=1`, args: [] });
    expect(Number((res.rows[0] as any).value)).toBe(LEGACY_ROW_COUNT);
    const pulled = await client.execute({
      sql: `SELECT id, seq, rev FROM vehicles WHERE seq > 0 ORDER BY seq`,
      args: [],
    });
    // Only the uniqueness and the coverage matter here: the backfill walks rows
    // in descending seq, and a since=0 pull receives every row in one pass.
    expect(pulled.rows.map((r: any) => String(r.id)).sort()).toEqual(['v-1', 'v-2']);
    expect(new Set(pulled.rows.map((r: any) => Number(r.seq))).size).toBe(2);
    for (const row of pulled.rows) expect(Number(row.rev)).toBeGreaterThanOrEqual(1);
  });

  it('keeps legacy data readable through the ownership-scoped queries', async () => {
    await client.execute({
      sql: `UPDATE vehicles SET user_id='legacy-owner' WHERE user_id IS NULL`,
      args: [],
    });
    const res = await client.execute({
      sql: `SELECT id FROM vehicles WHERE user_id = ? AND (deleted = 0 OR deleted IS NULL)`,
      args: ['legacy-owner'],
    });
    expect(res.rows.length).toBe(2);
    const newCols = await columnsOf(client, 'vehicles');
    expect(newCols).toContain('user_id');
    expect(await columnsOf(client, 'maintenance_logs')).toContain('parts_list');
    expect(await columnsOf(client, 'users')).toContain('is_guest');
  });

  it('rebuilds app_settings on (key, user_id) and keeps the legacy row global', async () => {
    const shape = await client.execute({
      sql: `SELECT sql FROM sqlite_master WHERE type='table' AND name='app_settings'`,
      args: [],
    });
    expect(String((shape.rows[0] as any).sql)).toContain('PRIMARY KEY (key, user_id)');
    const res = await client.execute({ sql: `SELECT key, value, user_id FROM app_settings`, args: [] });
    expect(res.rows.map((r: any) => [r.key, r.value, r.user_id])).toEqual([['currency', 'EGP', '']]);
  });

  it('rebuilds the spec cache with owner scoping and keeps the official row global', async () => {
    const shape = await client.execute({
      sql: `SELECT sql FROM sqlite_master WHERE type='table' AND name='global_vehicle_specs_cache'`,
      args: [],
    });
    expect(String((shape.rows[0] as any).sql)).toContain('UNIQUE(make_normalized, model_normalized, year, owner_user_id)');
    const res = await client.execute({ sql: `SELECT id, owner_user_id FROM global_vehicle_specs_cache`, args: [] });
    expect(res.rows.map((r: any) => [r.id, r.owner_user_id])).toEqual([['c-1', '']]);
  });

  it('is idempotent: a second startup on the migrated file changes nothing', async () => {
    const { client: again } = await getDatabase(dbPath);
    try {
      expect(await countNullSeq(again, 'vehicles')).toBe(0);
      const res = await again.execute({ sql: `SELECT value FROM sync_counter WHERE id=1`, args: [] });
      expect(Number((res.rows[0] as any).value)).toBe(LEGACY_ROW_COUNT);
      expect(await indexNames(again, 'vehicles')).toContain('idx_vehicles_seq');
    } finally {
      try { await again.close(); } catch { /* ignore */ }
    }
  });
});
