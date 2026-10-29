import { getDatabase } from '../persistence/db';
import { SYNC_TABLES, type SyncRow } from '../persistence/sync';
import type { Client } from '@libsql/client';

/**
 * Whole-account backup as a portable JSON document, and its inverse.
 *
 * Table/column identifiers always come from SYNC_TABLES, never from the file;
 * only values are parameterised. Vehicles are restored before their children so
 * foreign keys hold, and every accepted row is given a fresh seq so the change
 * propagates to the user's other devices through the normal pull cursor.
 */

export const BACKUP_KIND = 'carbook-backup';
export const BACKUP_VERSION = 1;

// Parent first: children carry a vehicle_id that must already resolve.
const TABLE_ORDER = ['vehicles', 'maintenance_schedules', 'maintenance_logs', 'fuel_logs'];

export interface BackupFile {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  counts: Record<string, number>;
  tables: Record<string, SyncRow[]>;
}

export type RestoreMode = 'merge' | 'replace';

export interface TableRestoreReport {
  inserted: number;
  skipped: number;
}

export interface RestoreReport {
  mode: RestoreMode;
  tables: Record<string, TableRestoreReport>;
  removed: number;
}

// The user who owns a row, resolved through the vehicle for child tables.
// `table` only ever comes from TABLE_ORDER, never from the backup file.
async function ownerOf(client: Client, table: string, id: string): Promise<string | null> {
  if (!id) return null;
  const res = table === 'vehicles'
    ? await client.execute({ sql: 'SELECT user_id FROM vehicles WHERE id = ?', args: [id] })
    : await client.execute({
        sql: `SELECT v.user_id FROM ${table} t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = ?`,
        args: [id],
      });
  const row = res.rows[0] as any;
  return row ? String(row.user_id ?? '') : null;
}

async function reserveSeq(client: Client, n: number): Promise<number> {
  if (n <= 0) return 0;
  const res = await client.batch(
    [
      { sql: 'UPDATE sync_counter SET value = value + ? WHERE id = 1;', args: [n] },
      { sql: 'SELECT value FROM sync_counter WHERE id = 1;', args: [] },
    ],
    'write',
  );
  return Number((res[1].rows[0] as any).value) - n + 1;
}

function ownedWhere(table: string): string {
  return SYNC_TABLES[table].owner === 'user'
    ? 'user_id = ? AND deleted = 0'
    : 'vehicle_id IN (SELECT id FROM vehicles WHERE user_id = ? AND deleted = 0) AND deleted = 0';
}

export async function createBackup(userId: string, opts?: { dbPath?: string }): Promise<BackupFile> {
  const { client } = await getDatabase(opts?.dbPath);
  const tables: Record<string, SyncRow[]> = {};
  const counts: Record<string, number> = {};

  for (const table of TABLE_ORDER) {
    const def = SYNC_TABLES[table];
    const res = await client.execute({
      sql: `SELECT id, ${def.columns.join(', ')} FROM ${table} WHERE ${ownedWhere(table)} ORDER BY rowid ASC`,
      args: [userId],
    });
    const rows = res.rows as any[];
    counts[table] = rows.length;
    tables[table] = rows.map((r) => {
      const row: SyncRow = { id: String(r.id) };
      for (const c of def.columns) row[c] = r[c] === null ? null : (def.boolColumns?.includes(c) ? r[c] === 1 : r[c]);
      return row;
    });
  }

  return { kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), counts, tables };
}

export function parseBackup(raw: unknown): BackupFile {
  const doc = raw as Partial<BackupFile> | null;
  if (!doc || typeof doc !== 'object') throw new Error('Not a valid backup file.');
  if (doc.kind !== BACKUP_KIND) throw new Error('Not a CarBook backup file.');
  if (Number(doc.version) > BACKUP_VERSION) {
    throw new Error(`Backup was written by a newer CarBook version (${doc.version}); update before restoring.`);
  }
  if (!doc.tables || typeof doc.tables !== 'object') throw new Error('Backup contains no tables.');

  const tables: Record<string, SyncRow[]> = {};
  for (const table of TABLE_ORDER) {
    const rows = (doc.tables as any)[table];
    if (rows === undefined || rows === null) {
      tables[table] = [];
      continue;
    }
    if (!Array.isArray(rows)) throw new Error(`Backup table '${table}' is not a list of rows.`);
    tables[table] = rows.filter((r: any) => r && typeof r.id === 'string' && r.id.length > 0);
  }
  return { kind: BACKUP_KIND, version: Number(doc.version) || 1, exportedAt: String(doc.exportedAt ?? ''), counts: {}, tables };
}

function sanitizeRow(table: string, row: SyncRow): SyncRow {
  const def = SYNC_TABLES[table];
  const clean: SyncRow = { id: String(row.id) };
  for (const c of def.columns) {
    let v = (row as any)[c];
    if (v === undefined) v = null;
    if (def.boolColumns?.includes(c)) v = v === true || v === 1 || v === '1' ? 1 : 0;
    else if (v === true) v = 1;
    else if (v === false) v = 0;
    clean[c] = v;
  }
  return clean;
}

export async function restoreBackup(
  payload: BackupFile,
  userId: string,
  mode: RestoreMode = 'merge',
  opts?: { dbPath?: string },
): Promise<RestoreReport> {
  const { client } = await getDatabase(opts?.dbPath);
  const report: RestoreReport = { mode, tables: {}, removed: 0 };

  if (mode === 'replace') {
    // Children first, then the vehicles they hang off of, so nothing is orphaned mid-flight.
    for (const table of [...TABLE_ORDER].reverse()) {
      const def = SYNC_TABLES[table];
      const ownerCol = def.owner === 'user' ? 'user_id' : 'vehicle_id';
      const where = def.owner === 'user'
        ? `${ownerCol} = ?`
        : `${ownerCol} IN (SELECT id FROM vehicles WHERE user_id = ?)`;
      const res = await client.execute({ sql: `DELETE FROM ${table} WHERE ${where}`, args: [userId] });
      report.removed += Number(res.rowsAffected ?? 0);
    }
  }

  const now = Date.now();
  // One table at a time, parents first: a child's parent check has to see the
  // vehicles already restored in this same run, not only the ones on disk beforehand.
  for (const table of TABLE_ORDER) {
    const def = SYNC_TABLES[table];
    const stats: TableRestoreReport = { inserted: 0, skipped: 0 };
    report.tables[table] = stats;

    const rows: SyncRow[] = [];
    for (const raw of payload.tables[table] ?? []) {
      const row = sanitizeRow(table, raw);

      const currentOwner = await ownerOf(client, table, String(row.id));
      // A row that already belongs to someone else is never touched, in either mode.
      if (currentOwner !== null && currentOwner !== userId) { stats.skipped++; continue; }
      if (currentOwner === userId && mode === 'merge') { stats.skipped++; continue; }

      const parentOwner = def.owner === 'user'
        ? userId
        : await ownerOf(client, 'vehicles', String(row.vehicle_id ?? ''));
      if (parentOwner !== userId) { stats.skipped++; continue; }

      rows.push(row);
      stats.inserted++;
    }

    if (!rows.length) continue;

    const seqCursor = await reserveSeq(client, rows.length);
    const cols = [...(def.owner === 'user' ? ['user_id'] : []), 'id', ...def.columns, 'rev', 'seq', 'sync_ts', 'deleted'];
    const setExprs = [...def.columns.map((c) => `${c} = excluded.${c}`), 'rev = rev + 1', 'seq = excluded.seq', 'sync_ts = excluded.sync_ts', 'deleted = 0'].join(', ');
    await client.batch(
      rows.map((row, i) => ({
        sql:
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ` +
          `ON CONFLICT(id) DO UPDATE SET ${setExprs}`,
        args: [
          ...(def.owner === 'user' ? [userId] : []),
          row.id,
          ...def.columns.map((c) => row[c] ?? null),
          1, seqCursor + i, now, 0,
        ],
      })),
      'write',
    );
  }

  return report;
}
