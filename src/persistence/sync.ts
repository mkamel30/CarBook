import { getDatabase } from './db';
import { z } from 'zod';
import type { Client } from '@libsql/client';
import {
  vehicleSchema,
  maintenanceScheduleSchema,
  maintenanceLogSchema,
  fuelLogSchema,
} from '../domain/schemas';

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
 *   response { serverSeq, pulled: { <table>: { upsert: [row], deleted: [id] } }, rejected, applied }
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
  /**
   * Per-row results of the push (additive; older clients ignore it). Lets a
   * device keep exactly the rows that were refused dirty instead of blindly
   * clearing every pending change after a successful HTTP response.
   */
  applied?: Array<{ table: string; id: string; kind: 'upsert' | 'delete' }>;
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
      'name', 'make', 'model', 'year', 'engine_cc', 'license_plate', 'initial_odometer',
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

// Coercion ceiling for int/real columns: junk that cannot become a finite
// number is left untouched so the Zod validator below rejects the row instead
// of a NaN reaching the database.
function coerceNumber(v: any, int: boolean): any {
  if (v === null || v === undefined) return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return int ? Math.trunc(n) : n;
}

function readColumn(row: SyncRow, name: string, def: TableDef): any {
  let v = row[name];
  if (v === undefined) v = null;
  if (def.boolColumns?.includes(name)) v = toBoolInt(v);
  else if (v === true) v = 1;
  else if (v === false) v = 0;
  if (v !== null && def.intColumns?.includes(name)) v = coerceNumber(v, true);
  else if (v !== null && def.realColumns?.includes(name)) v = coerceNumber(v, false);
  return v;
}

/**
 * Row validators for the push path, built from the shared domain schemas with
 * only the transport-level fields relaxed: sync row ids are client-generated
 * strings (not necessarily RFC-4122), TEXT columns like `specs` and timestamps
 * arrive as strings or epoch numbers. Every business constraint (nonnegative
 * odometer, positive liters/costs, year range, service-type enum, ...) stays
 * exactly as the REST layer enforces it.
 */
const looseScalar = z.union([z.string(), z.number()]).optional().nullable();
const SYNC_VALIDATORS: Record<string, z.ZodTypeAny> = {
  vehicles: vehicleSchema.extend({
    id: z.string().min(1).optional(),
    specs: z.unknown().optional(),
    createdAt: looseScalar,
    updatedAt: looseScalar,
  }),
  maintenance_schedules: maintenanceScheduleSchema.extend({
    id: z.string().min(1).optional(),
    vehicleId: z.string().min(1),
  }),
  maintenance_logs: maintenanceLogSchema.extend({
    id: z.string().min(1).optional(),
    vehicleId: z.string().min(1),
    createdAt: looseScalar,
  }),
  fuel_logs: fuelLogSchema.extend({
    id: z.string().min(1).optional(),
    vehicleId: z.string().min(1),
    createdAt: looseScalar,
  }),
};

/**
 * Business columns with a NOT NULL database constraint. Zod alone cannot cover
 * these (timestamps are optional in the domain schema), and a null here would
 * abort the whole write batch, so a row missing one is refused per-row instead.
 */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  vehicles: ['name', 'make', 'model', 'year', 'created_at'],
  maintenance_schedules: ['vehicle_id', 'item_code', 'title_ar', 'title_en', 'interval_km'],
  maintenance_logs: ['vehicle_id', 'service_date', 'odometer', 'service_type', 'title', 'total_cost', 'created_at'],
  fuel_logs: ['vehicle_id', 'fill_date', 'odometer', 'liters', 'price_per_liter', 'total_cost', 'created_at'],
};

function toCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** Build a camelCase candidate from the coerced business columns for Zod. */
function buildCandidate(raw: SyncRow, def: TableDef): SyncRow {
  const out: SyncRow = { id: String(raw.id) };
  for (const c of def.columns) {
    let v = readColumn(raw, c, def);
    if (def.boolColumns?.includes(c)) v = v === 1;
    out[toCamel(c)] = v;
  }
  return out;
}

// A client clock may run fast, but never faster than the server plus plausible
// skew: anything beyond that is treated as untrustworthy and clamped so it
// cannot outrank the current server state (LWW ties resolve to the server).
const CLOCK_SKEW_MS = 60_000;

function clampClientTs(rawTs: number, serverNow: number, existingSyncTs: number | null): number {
  if (!Number.isFinite(rawTs)) return serverNow;
  if (rawTs > serverNow + CLOCK_SKEW_MS) {
    return existingSyncTs === null ? serverNow : existingSyncTs;
  }
  if (rawTs > serverNow) return serverNow;
  return rawTs;
}

async function scalar(client: Client, sql: string, args: any[]): Promise<any> {
  const res = await client.execute({ sql, args });
  return res.rows.length ? Object.values(res.rows[0] as any)[0] : null;
}

// Atomically reserve a contiguous block of `n` seq numbers, returning the first one.
// Shared by the sync push path and every REST mutation (see repository.ts) so all
// writes to sync-visible tables land in one global order.
export async function reserveSeq(client: Client, n: number): Promise<number> {
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
  const applied: NonNullable<SyncResponse['applied']> = [];

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
      const existing = await client.execute({
        sql: `SELECT sync_ts, deleted${def.owner === 'user' ? ', user_id' : ', vehicle_id'} FROM ${table} WHERE id = ?`,
        args: [raw.id],
      });
      const ex = existing.rows[0] as any;

      // The server is the tombstone authority: a stale client that has not seen
      // the delete must not resurrect the row by pushing an older copy of it.
      if (ex && Number(ex.deleted || 0) === 1) continue;

      // Never trust a future-dated client clock (see clampClientTs).
      const ts = clampClientTs(
        Number(raw.updatedAt ?? raw.sync_ts ?? Date.now()),
        Date.now(),
        ex ? Number(ex.sync_ts || 0) : null,
      );

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

      // Domain validation before insert: one dirty row must not poison the batch,
      // and a rejected row is reported per-row so the client keeps it dirty.
      const missing = (REQUIRED_COLUMNS[table] || []).find(
        c => readColumn(raw, c, def) === null || readColumn(raw, c, def) === undefined,
      );
      if (missing) {
        rejected.push({ table, id: raw.id, reason: `invalid_payload:${missing}:required` });
        continue;
      }
      const validator = SYNC_VALIDATORS[table];
      if (validator) {
        const parsed = validator.safeParse(buildCandidate(raw, def));
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          rejected.push({
            table,
            id: raw.id,
            reason: `invalid_payload:${issue ? issue.path.join('.') : '?'}:${issue ? issue.message : 'invalid'}`,
          });
          continue;
        }
      }

      accepted.push({ table, row: raw, kind: 'upsert', ts });
    }

    for (const entry of payload.delete || []) {
      const id = typeof entry === 'string' ? entry : entry?.id;
      if (!id) continue;

      const existing = await client.execute({
        sql: `SELECT sync_ts, deleted${def.owner === 'user' ? ', user_id' : ', vehicle_id'} FROM ${table} WHERE id = ?`,
        args: [id],
      });
      const ex = existing.rows[0] as any;
      if (!ex) continue; // nothing to tombstone — idempotent

      const ts = clampClientTs(
        typeof entry === 'string' ? Date.now() : Number(entry?.updatedAt ?? Date.now()),
        Date.now(),
        Number(ex.sync_ts || 0),
      );

      // Ownership
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
      applied.push({ table: op.table, id: String(op.row.id), kind: op.kind });
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

  return { serverSeq, pulled, rejected, applied };
}
