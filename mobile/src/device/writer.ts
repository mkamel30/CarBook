import type { Database } from '@nozbe/watermelondb';
import { DEVICE_COLS, srvKey, type ColDef } from './schema';
import { groupsOf, touchedGroups } from '@sync/fieldGroups';
import { notifyDeviceWrite } from './writeEvents';

type Fields = Record<string, any>;

function colsFor(table: string) {
  return DEVICE_COLS[table];
}

/**
 * Device LWW stamps for the groups a write actually touched.
 *
 * Only the touched group's clock moves, so a service-baseline advance never
 * presents the item's config as newer than it is — which is what lets the server
 * merge the two independently (see @sync/fieldGroups and persistence/sync.ts).
 * `entireRow` covers a create or a restore, where every column is new by definition.
 */
function groupStamps(table: string, writtenColumns: Iterable<string>, entireRow: boolean, now: number): Fields {
  const groups = groupsOf(table);
  if (!groups) return {};
  const written = new Set(writtenColumns);
  const picked = entireRow ? groups : touchedGroups(table, written);
  const out: Fields = {};
  for (const g of picked) out[g.deviceTsColumn] = now;
  return out;
}

// The device column for `json` cols is a string; callers may hand over the parsed
// structure (e.g. parts_list as an array), so normalise on the way in. The push
// layer (localStore.serialize) parses it back for the server.
function normalize(col: ColDef, v: any): string | number | null {
  if (v === undefined || v === null) return null;
  if (col.json && typeof v !== 'string') return JSON.stringify(v);
  return v;
}

/** Create an offline row with a client-generated UUID (the device owns identity). */
export async function localCreate(db: Database, table: string, id: string, fields: Fields, at?: number): Promise<void> {
  const now = at ?? Date.now();
  await db.write(async () => {
    const c = db.collections.get(table as any);
    const raw: any = { id, _status: 'created', _changed: '', updated_at_sync: now, _dirty: 'created', _deleted_at: 0, rejected_reason: '' };
    for (const col of colsFor(table)) raw[col.col] = normalize(col, fields[srvKey(col)]);
    Object.assign(raw, groupStamps(table, [], true, now));
    const rec = c.prepareCreateFromDirtyRaw(raw);
    await db.batch(rec);
  });
  notifyDeviceWrite();
}

/** Update an existing row and mark it dirty for the next sync. */
export async function localUpdate(db: Database, table: string, id: string, fields: Fields, at?: number): Promise<void> {
  const now = at ?? Date.now();
  await db.write(async () => {
    const c = db.collections.get(table as any);
    const rec: any = await c.find(id);
    await rec.update((r: any) => {
      const written: string[] = [];
      for (const col of colsFor(table)) {
        const k = srvKey(col);
        if (k in fields) {
          r._raw[col.col] = normalize(col, fields[k]);
          written.push(k);
        }
      }
      r._raw.updated_at_sync = now;
      r._raw._dirty = 'updated';
      Object.assign(r._raw, groupStamps(table, written, false, now));
      // A fresh local revision supersedes whatever the server last refused.
      r._raw.rejected_reason = '';
    });
  });
  notifyDeviceWrite();
}

/** Soft-delete: keep the row locally so the tombstone can be pushed, then purge on ack. */
export async function localMarkDeleted(db: Database, table: string, id: string, at?: number): Promise<void> {
  const now = at ?? Date.now();
  await db.write(async () => {
    const c = db.collections.get(table as any);
    const rec: any = await c.find(id);
    await rec.update((r: any) => {
      r._raw._dirty = 'deleted';
      r._raw._deleted_at = now;
      r._raw.updated_at_sync = now;
    });
  });
  notifyDeviceWrite();
}

/**
 * Upsert used by the offline restore path: identical to localCreate/localUpdate
 * (so every restored row leaves the store dirty and rides up to the server), with
 * two restore-specific extras — the row is created when absent, and a local
 * tombstone is revived (`_deleted_at` cleared) when present.
 */
export async function localRestore(db: Database, table: string, id: string, fields: Fields, at?: number): Promise<void> {
  const now = at ?? Date.now();
  await db.write(async () => {
    const c = db.collections.get(table as any);
    let rec: any;
    try {
      rec = await c.find(id);
    } catch {
      rec = undefined;
    }
    if (!rec) {
      const raw: any = { id, _status: 'created', _changed: '', updated_at_sync: now, _dirty: 'created', _deleted_at: 0, rejected_reason: '' };
      for (const col of colsFor(table)) raw[col.col] = normalize(col, fields[srvKey(col)]);
      Object.assign(raw, groupStamps(table, [], true, now));
      await db.batch(c.prepareCreateFromDirtyRaw(raw));
      return;
    }
    await rec.update((r: any) => {
      const written: string[] = [];
      for (const col of colsFor(table)) {
        const k = srvKey(col);
        if (k in fields) {
          r._raw[col.col] = normalize(col, fields[k]);
          written.push(k);
        }
      }
      r._raw.updated_at_sync = now;
      r._raw._dirty = 'updated';
      r._raw._deleted_at = 0;
      // A restored document replaces the whole row (backup files carry complete
      // rows), so every group it carries is freshly stamped.
      Object.assign(r._raw, groupStamps(table, written, true, now));
      r._raw.rejected_reason = '';
    });
  });
  notifyDeviceWrite();
}
