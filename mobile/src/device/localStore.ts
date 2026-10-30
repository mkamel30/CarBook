import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import type {
  LocalStore,
  PushPayload,
  PulledTable,
  SyncRow,
} from '../../../src/sync/client';
import { DEVICE_COLS, SYNC_TABLE_NAMES, srvKey } from './schema';

// Dirty states stored in the device-only `_dirty` column. Rows the device changed
// since the last ack carry 'created' | 'updated' | 'deleted'; synced rows are ''.
const DIRTY_UNSYNCED = ['created', 'updated', 'deleted'];

type RawFields = Record<string, string | number | null>;

function businessCols(table: string) {
  return DEVICE_COLS[table];
}

// Build the server-shaped push row (snake_case columns + numeric updatedAt) from a
// device record's raw fields.
function serialize(table: string, id: string, raw: RawFields, updatedAt: number): SyncRow {
  const row: SyncRow = { id, updatedAt };
  for (const c of businessCols(table)) {
    row[srvKey(c)] = raw[c.col] ?? null;
  }
  return row;
}

function rawMapFromPulled(table: string, row: SyncRow, updatedAt: number): RawFields {
  const raw: RawFields = {
    updated_at_sync: updatedAt,
    _dirty: '',
    _deleted_at: 0,
  };
  for (const c of businessCols(table)) {
    const v = row[srvKey(c)];
    raw[c.col] = v === undefined ? null : (v as string | number | null);
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
  private pending: Array<{ table: string; id: string; at: number }> = [];

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
        this.pending.push({ table, id: String(rec.id), at: updatedAt });
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
            ops.push(rec.prepareUpdate((r: any) => { r._raw._dirty = ''; }));
          }
        }
      }
      await this.db.batch(...ops);
    });
    this.since = serverSeq;
    this.meta.saveSince?.(serverSeq);
  }
}
