import { getDatabase } from './db';
import type { Client } from '@libsql/client';

/**
 * Server side of the offline-first sync contract.
 *
 * Model: every row is a client-generated UUID. Each table gains sync columns
 *   rev     – per-row version, bumped on every accepted mutation
 *   seq     – global monotonic op counter value at last mutation (pull cursor)
 *   deleted – tombstone flag; deletes propagate to other devices instead of vanishing
 *   sync_ts – winning edit timestamp (ms) used for last-write-wins
 *
 * Protocol per call:
 *   request  { deviceId, since, pushed: { <table>: { upsert: [row], delete: [{id, updatedAt}] } } }
 *   response { serverSeq, pulled: { <table>: { upsert: [row], deleted: [id] } }, rejected }
 *
 * Table and column identifiers below are hard-coded and never taken from the
 * request; only values are parameterised.
 */

export type SyncRow = Record<string, any> & { id: string };

export interface PushTablePayload {
  upsert?: SyncRow[];
  delete?: Array<string | { id: string; updatedAt?: number }>;
}

export type PushPayload = Record<string, PushTablePayload>;

export interface SyncRequest {
  deviceId: string;
  since: number;
  pushed?: PushPayload;
}

export interface PulledTable {
  upsert: SyncRow[];
  deleted: string[];
}

export interface SyncResponse {
  serverSeq: number;
  pulled: Record<string, PulledTable>;
  rejected: Array<{ table: string; id: string; reason: string }>;
}

interface TableDef {
  // Business columns the client owns, in DB snake_case. Sync columns are managed here.
  columns: string[];
  // vehicles are owned directly via user_id; child rows inherit ownership via vehicle_id.
  owner: 'user' | 'vehicle';
  boolColumns?: string[];
  intColumns?: string[];
  realColumns?: string[];
}

export const SYNC_TABLES: Record<string, TableDef> = {
  vehicles: {
    columns: [
      'name', 'make', 'model', 'year', 'license_plate', 'initial_odometer',
      'current_odometer', 'recommended_oil', 'specs', 'created_at', 'updated_at',
    ],
    owner: 'user',
    intColumns: ['year'],
    realColumns: ['initial_odometer', 'current_odometer'],
  },
  maintenance_schedules: {
    columns: [
      'vehicle_id', 'item_code', 'title_ar', 'title_en', 'interval_km',
      'interval_months', 'last_done_odometer', 'last_done_date',
    ],
    owner: 'vehicle',
    intColumns: ['interval_months'],
    realColumns: ['interval_km', 'last_done_odometer'],
  },
  maintenance_logs: {
    columns: [
      'vehicle_id', 'service_date', 'odometer', 'service_type', 'title', 'parts_list',
      'parts_cost', 'labor_cost', 'total_cost', 'workshop', 'notes',
      'next_due_odometer', 'next_due_date', 'created_at',
    ],
    owner: 'vehicle',
    realColumns: ['odometer', 'parts_cost', 'labor_cost', 'total_cost', 'next_due_odometer'],
  },
  fuel_logs: {
    columns: [
      'vehicle_id', 'fill_date', 'odometer', 'liters', 'price_per_liter',
      'total_cost', 'is_full_tank', 'notes', 'created_at',
    ],
    owner: 'vehicle',
    boolColumns: ['is_full_tank'],
    realColumns: ['odometer', 'liters', 'price_per_liter', 'total_cost'],
  },
};

function toBoolInt(v: any): number {
  return v === true || v === 1 || v === '1' ? 1 : 0;
}

function readColumn(row: SyncRow, name: string, def: TableDef): any {
  let v = row[name];
  if (v === undefined) v = null;
  if (def.boolColumns?.includes(name)) v = toBoolInt(v);
  else if (v === true) v = 1;
  else if (v === false) v = 0;
  else if (v === undefined) v = null;
  return v;
}

async function scalar(client: Client, sql: string, args: any[]): Promise<any> {
  const res = await client.execute({ sql, args });
  return res.rows.length ? Object.values(res.rows[0] as any)[0] : null;
}

// Atomically reserve a contiguous block of `n` seq numbers, returning the first one.
async function reserveSeq(client: Client, n: number): Promise<number> {
  if (n <= 0) return 0;
  const res = await client.batch(
    [
      { sql: 'UPDATE sync_counter SET value = value + ? WHERE id = 1;', args: [n] },
      { sql: 'SELECT value FROM sync_counter WHERE id = 1;', args: [] },
    ],
    'write',
  );
  const hi = Number((res[1].rows[0] as any).value);
  return hi - n + 1;
}

async function currentSeq(client: Client): Promise<number> {
  return Number((await scalar(client, 'SELECT value FROM sync_counter WHERE id = 1;', [])) ?? 0);
}

interface PendingOp {
  table: string;
  row: SyncRow;
  kind: 'upsert' | 'delete';
  ts: number;
}

export async function runSync(
  userId: string,
  req: SyncRequest,
  opts?: { dbPath?: string },
): Promise<SyncResponse> {
  const { client } = await getDatabase(opts?.dbPath);
  const since = Number.isFinite(req.since) ? Math.max(0, Math.floor(req.since)) : 0;
  const rejected: SyncResponse['rejected'] = [];

  // 1) Collect candidate ops and decide which are accepted (ownership + LWW).
  const accepted: PendingOp[] = [];
  const pushed = req.pushed || {};
  // A device that creates a car and its logs in one call must not have the children
  // rejected for a parent that is accepted in this same request but not written yet.
  const vehiclesInRequest = new Set<string>();

  for (const table of Object.keys(SYNC_TABLES)) {
    const def = SYNC_TABLES[table];
    const payload = pushed[table];
    if (!payload) continue;

    for (const raw of payload.upsert || []) {
      if (!raw || typeof raw.id !== 'string' || !raw.id) {
        rejected.push({ table, id: String(raw?.id ?? ''), reason: 'missing_id' });
        continue;
      }
      const ts = Number(raw.updatedAt ?? raw.sync_ts ?? Date.now());

      const existing = await client.execute({
        sql: `SELECT sync_ts${def.owner === 'user' ? ', user_id' : ', vehicle_id'} FROM ${table} WHERE id = ?`,
        args: [raw.id],
      });
      const ex = existing.rows[0] as any;

      if (ex && Number(ex.sync_ts || 0) >= ts) continue; // server already newer/equal — drop, not an error

      // Ownership
      if (def.owner === 'user') {
        const owner = ex?.user_id;
        if (owner && owner !== userId && owner !== 'default') {
          rejected.push({ table, id: raw.id, reason: 'forbidden' });
          continue;
        }
        vehiclesInRequest.add(raw.id);
      } else {
        const vehicleId = raw.vehicle_id ?? ex?.vehicle_id;
        if (!vehicleId) { rejected.push({ table, id: raw.id, reason: 'no_parent' }); continue; }
        if (!vehiclesInRequest.has(vehicleId)) {
          const vOwner = await scalar(client, 'SELECT user_id FROM vehicles WHERE id = ?;', [vehicleId]);
          if (vOwner !== userId) { rejected.push({ table, id: raw.id, reason: 'forbidden' }); continue; }
        }
      }

      accepted.push({ table, row: raw, kind: 'upsert', ts });
    }

    for (const entry of payload.delete || []) {
      const id = typeof entry === 'string' ? entry : entry?.id;
      const ts = typeof entry === 'string' ? Date.now() : Number(entry?.updatedAt ?? Date.now());
      if (!id) continue;

      const existing = await client.execute({
        sql: `SELECT sync_ts, deleted${def.owner === 'user' ? ', user_id' : ', vehicle_id'} FROM ${table} WHERE id = ?`,
        args: [id],
      });
      const ex = existing.rows[0] as any;
      if (!ex) continue; // nothing to tombstone — idempotent

      if (def.owner === 'user') {
        const owner = ex?.user_id;
        if (owner && owner !== userId && owner !== 'default') {
          rejected.push({ table, id, reason: 'forbidden' });
          continue;
        }
      } else {
        const vOwner = await scalar(client, 'SELECT user_id FROM vehicles WHERE id = ?;', [ex.vehicle_id]);
        if (vOwner !== userId) { rejected.push({ table, id, reason: 'forbidden' }); continue; }
      }

      if (Number(ex.sync_ts || 0) > ts || Number(ex.deleted || 0) === 1) continue;
      accepted.push({ table, row: { id }, kind: 'delete', ts });
    }
  }

  // 2) Reserve seq numbers and apply accepted ops in one write transaction.
  if (accepted.length > 0) {
    const seqCursor = await reserveSeq(client, accepted.length);
    let i = 0;
    const stmts: Array<{ sql: string; args: any[] }> = [];
    for (const op of accepted) {
      const def = SYNC_TABLES[op.table];
      const seq = seqCursor + i++;
      if (op.kind === 'delete') {
        stmts.push({
          sql: `UPDATE ${op.table} SET deleted = 1, rev = rev + 1, seq = ?, sync_ts = ? WHERE id = ?`,
          args: [seq, op.ts, op.row.id],
        });
      } else {
        const isVeh = def.owner === 'user';
        const businessVals = def.columns.map(c => readColumn(op.row, c, def));
        const insertCols = [...(isVeh ? ['user_id'] : []), 'id', ...def.columns, 'rev', 'seq', 'sync_ts', 'deleted'];
        const values = [...(isVeh ? [userId] : []), op.row.id, ...businessVals, 1, seq, op.ts, 0];
        const setExprs = def.columns.map(c => `${c} = excluded.${c}`).join(', ');
        const ownerSet = isVeh ? ', user_id = excluded.user_id' : '';
        stmts.push({
          sql:
            `INSERT INTO ${op.table} (${insertCols.join(', ')}) VALUES (${values.map(() => '?').join(', ')}) ` +
            `ON CONFLICT(id) DO UPDATE SET ${setExprs}${ownerSet}, rev = rev + 1, seq = excluded.seq, sync_ts = excluded.sync_ts, deleted = 0`,
          args: values,
        });
      }
    }
    await client.batch(stmts, 'write');
  }

  // 3) Pull everything that changed on the server after `since` for this user.
  const serverSeq = await currentSeq(client);
  const pulled: Record<string, PulledTable> = {};
  for (const table of Object.keys(SYNC_TABLES)) {
    const def = SYNC_TABLES[table];
    const where = def.owner === 'user'
      ? `seq > ? AND user_id = ?`
      : `seq > ? AND vehicle_id IN (SELECT id FROM vehicles WHERE user_id = ?)`;
    const res = await client.execute({
      sql: `SELECT * FROM ${table} WHERE ${where} ORDER BY seq ASC`,
      args: [since, userId],
    });
    const upsert: SyncRow[] = [];
    const deleted: string[] = [];
    for (const r of res.rows as any[]) {
      if (Number(r.deleted) === 1) { deleted.push(String(r.id)); continue; }
      const obj: SyncRow = { id: String(r.id), updatedAt: Number(r.sync_ts), rev: Number(r.rev), deleted: 0 };
      for (const c of def.columns) obj[c] = r[c];
      if (def.owner === 'user') obj.user_id = r.user_id;
      upsert.push(obj);
    }
    if (upsert.length || deleted.length) pulled[table] = { upsert, deleted };
  }

  return { serverSeq, pulled, rejected };
}
