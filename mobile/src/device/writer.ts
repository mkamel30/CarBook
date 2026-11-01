import type { Database } from '@nozbe/watermelondb';
import { DEVICE_COLS, srvKey, type ColDef } from './schema';

type Fields = Record<string, any>;

function colsFor(table: string) {
  return DEVICE_COLS[table];
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
    const rec = c.prepareCreateFromDirtyRaw(raw);
    await db.batch(rec);
  });
}

/** Update an existing row and mark it dirty for the next sync. */
export async function localUpdate(db: Database, table: string, id: string, fields: Fields, at?: number): Promise<void> {
  const now = at ?? Date.now();
  await db.write(async () => {
    const c = db.collections.get(table as any);
    const rec: any = await c.find(id);
    await rec.update((r: any) => {
      for (const col of colsFor(table)) {
        const k = srvKey(col);
        if (k in fields) r._raw[col.col] = normalize(col, fields[k]);
      }
      r._raw.updated_at_sync = now;
      r._raw._dirty = 'updated';
      // A fresh local revision supersedes whatever the server last refused.
      r._raw.rejected_reason = '';
    });
  });
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
}
