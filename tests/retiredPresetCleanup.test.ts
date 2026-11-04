import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@libsql/client';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDatabase } from '@/persistence/db';

/**
 * The differential gear oil item was removed from the factory catalogue, but
 * cars created before the removal still carry a live seeded row. The startup
 * migration must tombstone those rows (so the delete syncs to every device) and
 * leave everything else alone, idempotently.
 */
const dbPath = path.join(
  os.tmpdir(),
  `carbook_retired_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
);
const fileUrl = `file:${dbPath.replace(/\\/g, '/')}`;

const openClient = () => createClient({ url: fileUrl });

async function query(sql: string, args: any[] = []): Promise<any[]> {
  const c = openClient();
  try {
    const res = await c.execute({ sql, args });
    return res.rows as any[];
  } finally {
    await c.close();
  }
}

describe('startup migration tombstones retired factory presets', () => {
  beforeAll(async () => {
    if (fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
    }

    // 1) Empty schema via the normal startup path, then close the client.
    const first = await getDatabase(dbPath);
    await first.client.close();

    // 2) Seed a vehicle plus one retired and one live schedule, pre-sync (seq NULL).
    const seed = openClient();
    try {
      await seed.batch([
        `INSERT INTO vehicles (id, name, make, model, year, created_at, updated_at)
           VALUES ('v-1','Corolla','Toyota','Corolla',2020,'2026-01-01','2026-01-01');`,
        `INSERT INTO maintenance_schedules (id, vehicle_id, item_code, title_ar, title_en, interval_km, interval_months)
           VALUES ('s-ret','v-1','differential_gear_oil','زيت الدفرنس','Differential gear oil',50000,36);`,
        `INSERT INTO maintenance_schedules (id, vehicle_id, item_code, title_ar, title_en, interval_km, interval_months)
           VALUES ('s-oil','v-1','engine_oil_filter','زيت المحرك','Engine oil',10000,6);`,
      ], 'write');
    } finally {
      await seed.close();
    }

    // 3) Re-open through the migration path, which must tombstone the retired row.
    const migrated = await getDatabase(dbPath);
    await migrated.client.close();
  }, 120_000);

  afterAll(() => {
    for (const ext of ['', '-wal', '-shm']) {
      try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
    }
  });

  it('tombstones the retired differential row with a seq newer than every backfilled row', async () => {
    const rows = await query(
      `SELECT deleted, rev, seq, sync_ts, baseline_ts FROM maintenance_schedules WHERE id = 's-ret'`,
    );
    expect(rows.length).toBe(1);
    const r = rows[0];
    expect(Number(r.deleted)).toBe(1);
    expect(Number(r.rev)).toBe(2); // backfill set rev>=1, tombstone bumped once more
    expect(Number(r.seq)).toBe(4); // 3 backfilled rows + 1 retired tombstone
    expect(Number(r.sync_ts)).toBeGreaterThan(0);
    expect(Number(r.baseline_ts)).toBeGreaterThan(0);
  });

  it('leaves the live engine-oil schedule untouched', async () => {
    const rows = await query(
      `SELECT deleted, rev, seq FROM maintenance_schedules WHERE id = 's-oil'`,
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].deleted)).toBe(0);
    expect(Number(rows[0].seq)).toBeGreaterThan(0);
  });

  it('advances sync_counter by exactly the retired count on top of the backfill', async () => {
    const rows = await query(`SELECT value FROM sync_counter WHERE id = 1`);
    expect(Number(rows[0].value)).toBe(4);
  });

  it('is idempotent: a second startup leaves the tombstone and counter unchanged', async () => {
    const again = await getDatabase(dbPath);
    await again.client.close();

    const r = (await query(
      `SELECT deleted, seq FROM maintenance_schedules WHERE id = 's-ret'`,
    ))[0];
    expect(Number(r.deleted)).toBe(1);
    expect(Number(r.seq)).toBe(4);

    const counter = (await query(`SELECT value FROM sync_counter WHERE id = 1`))[0];
    expect(Number(counter.value)).toBe(4);
  });
});
