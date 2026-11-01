// Offline backup + restore: the device-side mirror of src/services/backup.ts.
//
// The server reads/writes libsql; the device reads/writes WatermelonDB. Same
// portable document, same semantics, deliberately the same error strings — so a
// file exported from either surface restores on the other. src/** is frozen, so
// this is a mobile-layer implementation, not a shared one.
//
// Contract kept identical to the server:
//   kind 'carbook-backup', version 1, exportedAt ISO, counts, tables keyed by
//   TABLE_ORDER with parent vehicles first (a child's vehicle_id must resolve).
//   Row values are the SERVER column names (snake_case); JSON columns stay JSON
//   TEXT, exactly as the server's SQLite stores them.
// Device difference, by necessity: a replace-mode removal is a TOMBSTONE written
// through @device/writer, not a hard DELETE — so removals sync up to the server
// instead of silently diverging. `report.removed` therefore counts rows the
// device retired (rows the backup re-supplies are revived and stay in place).

import type { Database } from '@nozbe/watermelondb';
import { localMarkDeleted, localRestore } from '@device/writer';
import { DEVICE_COLS, srvKey, type ColDef } from '@device/schema';
import { DEFAULT_MAX_SNAPSHOT_BYTES } from './lokiPersistence';

export const BACKUP_KIND = 'carbook-backup';
export const BACKUP_VERSION = 1;

// Parent first, same order as the server: children carry a vehicle_id that must
// already resolve.
export const BACKUP_TABLE_ORDER = [
  'vehicles',
  'maintenance_schedules',
  'maintenance_logs',
  'fuel_logs',
] as const;

export type BackupTableName = (typeof BACKUP_TABLE_ORDER)[number];

/**
 * Server column list per table, in the server's order. Kept local (never imported
 * from src/persistence/sync) so libsql cannot leak into the APK bundle;
 * backupBridge.test.ts asserts it against the real SYNC_TABLES as a drift guard.
 */
export const BACKUP_COLUMNS: Record<BackupTableName, string[]> = {
  vehicles: [
    'name', 'make', 'model', 'year', 'engine_cc', 'license_plate', 'initial_odometer',
    'current_odometer', 'recommended_oil', 'specs', 'created_at', 'updated_at',
  ],
  maintenance_schedules: [
    'vehicle_id', 'item_code', 'title_ar', 'title_en', 'interval_km',
    'interval_months', 'last_done_odometer', 'last_done_date',
  ],
  maintenance_logs: [
    'vehicle_id', 'service_date', 'odometer', 'service_type', 'title', 'parts_list',
    'parts_cost', 'labor_cost', 'total_cost', 'workshop', 'notes',
    'next_due_odometer', 'next_due_date', 'created_at',
  ],
  fuel_logs: [
    'vehicle_id', 'fill_date', 'odometer', 'liters', 'price_per_liter',
    'total_cost', 'is_full_tank', 'notes', 'created_at',
  ],
};

export type BackupRow = Record<string, any> & { id: string };

export interface BackupFile {
  kind: string;
  version: number;
  exportedAt: string;
  counts: Record<string, number>;
  tables: Record<string, BackupRow[]>;
}

export type RestoreMode = 'merge' | 'replace';
export const RESTORE_MODES: RestoreMode[] = ['merge', 'replace'];

export interface TableRestoreReport { inserted: number; skipped: number }
export interface RestoreReport {
  mode: RestoreMode;
  tables: Record<string, TableRestoreReport>;
  removed: number;
}

const BOOL_COLUMNS: Record<string, string[]> = { fuel_logs: ['is_full_tank'] };
// SQLite INTEGER columns: the server hands back whole numbers, so do the same.
const INT_COLUMNS: Record<string, string[]> = { vehicles: ['year'], maintenance_schedules: ['interval_months'] };

/** A restore bigger than the persistence budget could never be saved back. */
export const MAX_RESTORE_BYTES = DEFAULT_MAX_SNAPSHOT_BYTES;

export class BackupTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super(`Backup is ${bytes} bytes, over the ${MAX_RESTORE_BYTES}-byte device budget.`);
  }
}

// ---- device raw <-> backup row --------------------------------------------

function colBySrvKey(table: string): Map<string, ColDef> {
  const map = new Map<string, ColDef>();
  for (const c of DEVICE_COLS[table]) map.set(srvKey(c), c);
  return map;
}

const COLS: Record<string, Map<string, ColDef>> = Object.fromEntries(
  Object.keys(DEVICE_COLS).map((t) => [t, colBySrvKey(t)]),
);

/** Device raw value -> the backup-file value the server would have written. */
function toBackupValue(table: string, col: string, v: unknown): unknown {
  const def = COLS[table]?.get(col);
  if (v === undefined || v === null || v === '') {
    // JSON columns keep their TEXT form; an empty TEXT column is server NULL.
    return null;
  }
  if (BOOL_COLUMNS[table]?.includes(col)) return Number(v) === 1 || v === true ? 1 : 0;
  if (!def) return v;
  if (def.json) return typeof v === 'string' ? v : JSON.stringify(v);
  if (def.type === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return INT_COLUMNS[table]?.includes(col) ? Math.trunc(n) : n;
  }
  return String(v);
}

/** Backup-file value -> the value a device column holds. */
function toDeviceValueForCol(def: ColDef, v: unknown): string | number | null {
  if (v === undefined || v === null) return null;
  if (def.json) return typeof v === 'string' ? v : JSON.stringify(v);
  if (def.type === 'number') {
    const n = Number(v as any);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Mirror the server's sanitizeRow: every declared column present, bools 0/1. */
export function sanitizeBackupRow(table: BackupTableName, row: BackupRow): BackupRow {
  const clean: BackupRow = { id: String(row.id) };
  for (const c of BACKUP_COLUMNS[table]) {
    let v: any = (row as any)[c];
    if (v === undefined) v = null;
    if (BOOL_COLUMNS[table]?.includes(c)) v = v === true || v === 1 || v === '1' ? 1 : 0;
    else if (v === true) v = 1;
    else if (v === false) v = 0;
    clean[c] = v;
  }
  return clean;
}

// ---- export ---------------------------------------------------------------

interface LiveRow { id: string; raw: Record<string, any> }

async function liveRows(db: Database, table: string): Promise<LiveRow[]> {
  const recs = await db.collections.get(table as any).query().fetch();
  return (recs as any[])
    .filter((r) => (r._raw?._dirty ?? '') !== 'deleted')
    .map((r) => ({ id: String(r.id), raw: r._raw || {} }));
}

async function findAny(db: Database, table: string, id: string): Promise<LiveRow | null> {
  try {
    const rec: any = await db.collections.get(table as any).find(id);
    return rec ? { id: String(rec.id), raw: rec._raw || {} } : null;
  } catch {
    return null;
  }
}

/** Same document the server's createBackup() produces, from local tables only. */
export async function buildBackupDocument(
  db: Database,
  now: () => Date = () => new Date(),
): Promise<BackupFile> {
  const tables: Record<string, BackupRow[]> = {};
  const counts: Record<string, number> = {};

  for (const table of BACKUP_TABLE_ORDER) {
    const rows = await liveRows(db, table);
    counts[table] = rows.length;
    tables[table] = rows.map(({ id, raw }) => {
      const out: BackupRow = { id };
      for (const col of BACKUP_COLUMNS[table as BackupTableName]) {
        // Vehicles store their ISO dates under *_iso on the device.
        const deviceCol = COLS[table].get(col);
        const value = deviceCol ? raw[deviceCol.col] : raw[col];
        out[col] = toBackupValue(table, col, value);
      }
      return out;
    });
  }

  return { kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: now().toISOString(), counts, tables };
}

// ---- parse ----------------------------------------------------------------

/** Verbatim port of the server's parseBackup, including its messages. */
export function parseBackupDocument(raw: unknown): BackupFile {
  const doc = raw as Partial<BackupFile> | null;
  if (!doc || typeof doc !== 'object') throw new Error('Not a valid backup file.');
  if (doc.kind !== BACKUP_KIND) throw new Error('Not a CarBook backup file.');
  if (Number(doc.version) > BACKUP_VERSION) {
    throw new Error(`Backup was written by a newer CarBook version (${doc.version}); update before restoring.`);
  }
  if (!doc.tables || typeof doc.tables !== 'object') throw new Error('Backup contains no tables.');

  const tables: Record<string, BackupRow[]> = {};
  for (const table of BACKUP_TABLE_ORDER) {
    const rows = (doc.tables as any)[table];
    if (rows === undefined || rows === null) {
      tables[table] = [];
      continue;
    }
    if (!Array.isArray(rows)) throw new Error(`Backup table '${table}' is not a list of rows.`);
    tables[table] = rows.filter((r: any) => r && typeof r.id === 'string' && r.id.length > 0);
  }
  return {
    kind: BACKUP_KIND,
    version: Number(doc.version) || 1,
    exportedAt: String((doc as any).exportedAt ?? ''),
    counts: {},
    tables,
  };
}

// ---- restore --------------------------------------------------------------

function fieldsFor(table: BackupTableName, row: BackupRow): Record<string, string | number | null> {
  const fields: Record<string, string | number | null> = {};
  for (const col of BACKUP_COLUMNS[table]) {
    const def = COLS[table].get(col);
    if (!def) continue;
    fields[col] = toDeviceValueForCol(def, row[col]);
  }
  return fields;
}

/**
 * Merge keeps every row the device already has (the server skips a row whose
 * owner is this same user in merge mode); replace retires rows the file does not
 * mention, then re-applies the file. Everything goes through the writer, so each
 * restored row is dirty and rides up to the server on the next sync.
 */
export async function applyBackupDocument(
  db: Database,
  payload: BackupFile,
  mode: RestoreMode = 'merge',
  at: number = Date.now(),
): Promise<RestoreReport> {
  const report: RestoreReport = { mode, tables: {}, removed: 0 };

  if (mode === 'replace') {
    // Children first, then their vehicles, so nothing is orphaned mid-flight.
    for (const table of [...BACKUP_TABLE_ORDER].reverse() as BackupTableName[]) {
      const keep = new Set((payload.tables[table] ?? []).map((r) => String(r.id)));
      for (const row of await liveRows(db, table)) {
        if (keep.has(row.id)) continue;
        await localMarkDeleted(db, table, row.id, at);
        report.removed++;
      }
    }
  }

  for (const table of BACKUP_TABLE_ORDER) {
    const stats: TableRestoreReport = { inserted: 0, skipped: 0 };
    report.tables[table] = stats;

    // Live vehicle ids, read once per table pass (after the vehicles pass, so a
    // vehicle restored earlier in this same run resolves for its children).
    const liveVehicleIds = table === 'vehicles'
      ? new Set<string>()
      : new Set((await liveRows(db, 'vehicles')).map((v) => v.id));

    for (const raw of payload.tables[table] ?? []) {
      const row = sanitizeBackupRow(table, raw);
      const existing = await findAny(db, table, row.id);
      // Already present locally (live or tombstoned) = already ours: merge never
      // re-applies it, and a row the device already holds is never overwritten.
      if (existing && mode === 'merge') { stats.skipped++; continue; }

      if (table !== 'vehicles' && !liveVehicleIds.has(String(row.vehicle_id ?? ''))) {
        // Ownership analogue of the server's parent check: the vehicle must be
        // live locally right now.
        stats.skipped++;
        continue;
      }

      await localRestore(db, table, row.id, fieldsFor(table, row), at);
      stats.inserted++;
    }
  }

  return report;
}

/** Byte size of a document, for the persistence-budget guard. */
export function backupByteSize(doc: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(doc)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
