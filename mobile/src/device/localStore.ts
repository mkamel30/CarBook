import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import type {
  LocalStore,
  PushPayload,
  PulledTable,
  SyncResponseData,
  SyncRow,
} from '../../../src/sync/client';
import { DEVICE_COLS, SYNC_TABLE_NAMES, srvKey, toDeviceValue, toSrvValue } from './schema';
import { groupsOf } from '@sync/fieldGroups';

// Dirty states stored in the device-only `_dirty` column. Rows the device changed
// since the last ack carry 'created' | 'updated' | 'deleted'; synced rows are ''.
const DIRTY_UNSYNCED = ['created', 'updated', 'deleted'];

type RawFields = Record<string, string | number | null>;
type RejectedRow = NonNullable<SyncResponseData['rejected']>[number];
type PendingRow = { table: string; id: string; at: number; status: string; raw: RawFields };

function businessCols(table: string) {
  return DEVICE_COLS[table];
}

/**
 * READ-ONLY outbox size: how many rows still carry an unsent local change.
 *
 * Exists for the auto-sync watcher (offline/syncBoot.ts), which has to notice
 * writes without hooking the fetch bridge. It deliberately does NOT reuse
 * `WMDBLocalStore.collectDirty()`: that method re-snapshots `pending`/
 * `lastPushed`, the bookkeeping the transport uses to decide which revisions are
 * still unsent, so sampling it between or during syncs would corrupt it. This is
 * a pure COUNT over the same `_dirty` predicate and touches no writes.
 */
export async function countDirtyRows(db: Database): Promise<number> {
  let total = 0;
  for (const table of SYNC_TABLE_NAMES) {
    const c = db.collections.get(table as any);
    total += await c.query(Q.where('_dirty', Q.oneOf(DIRTY_UNSYNCED))).fetchCount();
  }
  return total;
}

// Build the server-shaped push row (snake_case columns + numeric updatedAt) from a
// device record's raw fields. `json` columns are parsed so the server's Zod
// validators see real structures (parts_list must arrive as an array).
function serialize(table: string, id: string, raw: RawFields, updatedAt: number): SyncRow {
  const row: SyncRow = { id, updatedAt };
  for (const c of businessCols(table)) {
    row[srvKey(c)] = toSrvValue(c, raw[c.col] as string | number | null);
  }
  // Per-group last-write-wins clocks. A row written before the device had them
  // argues with its row revision instead — byte-identical to the old row-level
  // rule, so an upgraded snapshot cannot suddenly claim stale columns as new.
  for (const g of groupsOf(table) ?? []) {
    row[g.tsKey] = Number(raw[g.deviceTsColumn] ?? updatedAt);
  }
  return row;
}

function rawMapFromPulled(table: string, row: SyncRow, updatedAt: number): RawFields {
  const raw: RawFields = {
    updated_at_sync: updatedAt,
    _dirty: '',
    _deleted_at: 0,
    rejected_reason: '',
  };
  for (const c of businessCols(table)) {
    raw[c.col] = toDeviceValue(c, row[srvKey(c)]);
  }
  // Keep the server's per-group stamps, so the next local edit of one group does
  // not present the other group as freshly changed too.
  for (const g of groupsOf(table) ?? []) {
    raw[g.deviceTsColumn] = Number(row[g.tsKey] ?? row.updatedAt ?? 0);
  }
  return raw;
}

/**
 * Adapts a WatermelonDB device database to the runtime-agnostic sync client's
 * LocalStore contract. Client-generated UUIDs are authoritative: rows pulled from
 * the server are created with the SAME id (prepareCreateFromDirtyRaw) so the two
 * sides can never fork a record into two identities.
 */
export class WMDBLocalStore implements LocalStore {
  private since = 0;
  // What collectDirty() handed to the transport, so markSynced() only clears rows
  // that are still exactly as they were when pushed.
  private pending: PendingRow[] = [];
  // The same snapshot, kept past markSynced() so remarkRejected() can restore the
  // exact dirty state (and, for refused deletes, the row body) of pushed rows the
  // server refused. Reset only by the next collectDirty().
  private lastPushed: PendingRow[] = [];

  constructor(
    private db: Database,
    private meta: { loadSince?: () => number; saveSince?: (seq: number) => void } = {},
  ) {
    this.since = meta.loadSince?.() ?? 0;
  }

  getSince(): number {
    return this.since;
  }

  // Local revision (`updated_at_sync`) of every dirty row, keyed by id.
  private async dirtyState(table: string): Promise<Map<string, number>> {
    const c = this.db.collections.get(table as any);
    const dirty = await c.query(Q.where('_dirty', Q.oneOf(DIRTY_UNSYNCED))).fetch();
    const byId = new Map<string, number>();
    for (const rec of dirty as any[]) {
      byId.set(String(rec.id), Number((rec as any)._raw.updated_at_sync) || 0);
    }
    return byId;
  }

  /**
   * True when the local row holds an edit the server has never seen. A row stays
   * dirty until markSynced() clears it, so dirtiness alone says nothing: only a
   * local revision that no longer matches the one collectDirty() pushed is unsent.
   * Overwriting one with the server's copy would discard it with nothing left to
   * retry; a row still exactly as pushed is safe to replace, which is what resolves
   * a lost last-write-wins race back to the server's authoritative value.
   */
  private isUnsent(table: string, id: string, localAt: number | undefined): boolean {
    if (localAt === undefined) return false;
    const pushedAt = this.pending.find((p) => p.table === table && p.id === id)?.at;
    return pushedAt !== localAt;
  }

  async collectDirty(): Promise<PushPayload> {
    const pushed: PushPayload = {};
    this.pending = [];
    this.lastPushed = [];
    for (const table of SYNC_TABLE_NAMES) {
      const c = this.db.collections.get(table as any);
      const dirty = await c.query(Q.where('_dirty', Q.oneOf(DIRTY_UNSYNCED))).fetch();
      if (!dirty.length) continue;
      const upsert: SyncRow[] = [];
      const del: Array<{ id: string; updatedAt: number }> = [];
      for (const rec of dirty as any[]) {
        const raw = (rec as any)._raw || {};
        const status = raw._dirty;
        const updatedAt = Number(raw.updated_at_sync) || Date.now();
        const entry: PendingRow = { table, id: String(rec.id), at: updatedAt, status, raw: { ...raw } };
        this.pending.push(entry);
        this.lastPushed.push(entry);
        if (status === 'deleted') {
          del.push({ id: rec.id, updatedAt });
        } else {
          upsert.push(serialize(table, rec.id, raw, updatedAt));
        }
      }
      if (upsert.length) (pushed[table] ||= {}).upsert = upsert;
      if (del.length) (pushed[table] ||= {}).delete = del;
    }
    return pushed;
  }

  async applyPulled(pulled: Record<string, PulledTable>): Promise<void> {
    await this.db.write(async () => {
      const ops: any[] = [];
      for (const table of SYNC_TABLE_NAMES) {
        const bucket = pulled[table];
        if (!bucket) continue;
        const c = this.db.collections.get(table as any);
        const dirtyAt = await this.dirtyState(table);

        for (const row of bucket.upsert || []) {
          if (this.isUnsent(table, String(row.id), dirtyAt.get(String(row.id)))) continue;
          const updatedAt = Number(row.updatedAt ?? 0);
          const raw = rawMapFromPulled(table, row, updatedAt);
          let existing: any;
          try {
            existing = await c.find(row.id);
          } catch {
            existing = undefined;
          }
          if (existing) {
            ops.push(
              existing.prepareUpdate((r: any) => {
                for (const col of Object.keys(raw)) r._raw[col] = raw[col];
              }),
            );
          } else {
            ops.push(
              c.prepareCreateFromDirtyRaw({
                id: row.id,
                _status: 'created',
                _changed: '',
                ...raw,
              }),
            );
          }
        }

        for (const id of bucket.deleted || []) {
          if (this.isUnsent(table, String(id), dirtyAt.get(String(id)))) continue;
          try {
            const rec = await c.find(id);
            ops.push(rec.prepareDestroyPermanently());
          } catch {
            /* already absent locally */
          }
        }
      }
      await this.db.batch(...ops);
    });
  }

  async markSynced(serverSeq: number): Promise<void> {
    const pushed = this.pending;
    this.pending = [];
    await this.db.write(async () => {
      const ops: any[] = [];
      for (const table of SYNC_TABLE_NAMES) {
        const wanted = new Map(pushed.filter((p) => p.table === table).map((p) => [p.id, p.at]));
        if (!wanted.size) continue;
        const c = this.db.collections.get(table as any);
        const dirty = await c.query(Q.where('_dirty', Q.oneOf(DIRTY_UNSYNCED))).fetch();
        for (const rec of dirty as any[]) {
          const at = wanted.get(String(rec.id));
          // Only retire the exact revision the server accepted; anything written
          // while the request was in flight keeps its dirty flag for the next sync.
          if (at === undefined || Number((rec as any)._raw.updated_at_sync) !== at) continue;
          if ((rec as any)._raw._dirty === 'deleted') {
            ops.push(rec.prepareDestroyPermanently());
          } else {
            ops.push(rec.prepareUpdate((r: any) => {
              r._raw._dirty = '';
              // The server accepted this exact revision: any earlier refusal is stale.
              r._raw.rejected_reason = '';
            }));
          }
        }
      }
      await this.db.batch(...ops);
    });
    this.since = serverSeq;
    this.meta.saveSince?.(serverSeq);
  }

  /**
   * Second half of the ack: syncOnce() calls this right after markSynced() cleared
   * the whole dirty set, with the rows the server refused per-row. A refused row
   * must go back to the exact dirty state it was pushed in — never acknowledged,
   * flagged with the server's reason so the UI can surface it and the next sync
   * retries (or the user edits and the new revision wins). Deliberately
   * UI-agnostic: bookkeeping columns only.
   */
  async remarkRejected(rejected: RejectedRow[]): Promise<void> {
    if (!rejected.length) return;
    await this.db.write(async () => {
      const ops: any[] = [];
      for (const rej of rejected) {
        const table = String(rej.table);
        if (!SYNC_TABLE_NAMES.includes(table)) continue;
        const snap = this.lastPushed.find((p) => p.table === table && p.id === String(rej.id));
        if (!snap) continue; // not something this push sent — nothing to restore
        const c = this.db.collections.get(table as any);
        const reason = String(rej.reason || 'rejected').slice(0, 400);
        let rec: any;
        try {
          rec = await c.find(String(rej.id));
        } catch {
          rec = undefined;
        }
        if (!rec) {
          // A refused tombstone: markSynced() purged it believing the delete landed.
          // Recreate the row with its pushed body, still dirty, so the delete retries.
          if (snap.status !== 'deleted') continue;
          ops.push(c.prepareCreateFromDirtyRaw({
            id: String(rej.id),
            _status: 'created',
            _changed: '',
            ...snap.raw,
            _dirty: 'deleted',
            rejected_reason: reason,
          }));
          continue;
        }
        // Re-mark only the revision the server actually saw. A row re-edited
        // mid-flight (newer updated_at_sync) or replaced by the pulled server copy
        // is already in the right state; leave it alone.
        const raw = (rec as any)._raw || {};
        if (raw._dirty === '' && Number(raw.updated_at_sync) === snap.at) {
          ops.push(rec.prepareUpdate((r: any) => {
            r._raw._dirty = snap.status;
            r._raw.rejected_reason = reason;
          }));
        }
      }
      await this.db.batch(...ops);
    });
  }
}
