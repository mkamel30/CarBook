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

  constructor(
    private db: Database,
    private meta: { loadSince?: () => number; saveSince?: (seq: number) => void } = {},
  ) {
    this.since = meta.loadSince?.() ?? 0;
  }

  getSince(): number {
    return this.since;
  }

  async collectDirty(): Promise<PushPayload> {
    const pushed: PushPayload = {};
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

        for (const row of bucket.upsert || []) {
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
    await this.db.write(async () => {
      const ops: any[] = [];
      for (const table of SYNC_TABLE_NAMES) {
        const c = this.db.collections.get(table as any);
        const dirty = await c.query(Q.where('_dirty', Q.oneOf(['created', 'updated']))).fetch();
        for (const rec of dirty as any[]) {
          ops.push(rec.prepareUpdate((r: any) => { r._raw._dirty = ''; }));
        }
        const deleted = await c.query(Q.where('_dirty', 'deleted')).fetch();
        for (const rec of deleted as any[]) {
          ops.push(rec.prepareDestroyPermanently());
        }
      }
      await this.db.batch(...ops);
    });
    this.since = serverSeq;
    this.meta.saveSince?.(serverSeq);
  }
}
