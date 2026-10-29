import type { Database } from '@nozbe/watermelondb';
import { DEVICE_COLS, srvKey } from './schema';

type Fields = Record<string, string | number | null>;

function colsFor(table: string) {
  return DEVICE_COLS[table];
}

/** Create an offline row with a client-generated UUID (the device owns identity). */
export async function localCreate(db: Database, table: string, id: string, fields: Fields, at?: number): Promise<void> {
  const now = at ?? Date.now();
  await db.write(async () => {
    const c = db.collections.get(table as any);
    const raw: any = { id, _status: 'created', _changed: '', updated_at_sync: now, _dirty: 'created', _deleted_at: 0 };
    for (const col of colsFor(table)) raw[col.col] = fields[srvKey(col)] ?? null;
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
        if (k in fields) r._raw[col.col] = fields[k];
      }
      r._raw.updated_at_sync = now;
      r._raw._dirty = 'updated';
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
