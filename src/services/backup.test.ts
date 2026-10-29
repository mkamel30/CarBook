import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDatabase } from '../persistence/db';
import { runSync } from '../persistence/sync';
import { createBackup, parseBackup, restoreBackup } from './backup';

let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `carbook_backup_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
});

afterEach(() => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

async function seedUser(id: string, email: string) {
  const { client } = await getDatabase(dbPath);
  const now = new Date().toISOString();
  await client.execute({
    sql: 'INSERT INTO users (id, email, name, picture, created_at, last_login_at) VALUES (?, ?, ?, NULL, ?, ?)',
    args: [id, email, 'Test', now, now],
  });
}

const iso = () => new Date().toISOString();

async function seedVehicle(id: string, userId: string, name: string, odometer: number) {
  const { client } = await getDatabase(dbPath);
  await client.execute({
    sql: `INSERT INTO vehicles (id, user_id, name, make, model, year, current_odometer, initial_odometer, created_at, updated_at, rev, seq, sync_ts, deleted)
          VALUES (?, ?, ?, 'Toyota', 'Corolla', 2020, ?, 0, ?, ?, 1, 0, 0, 0)`,
    args: [id, userId, name, odometer, iso(), iso()],
  });
}

async function seedFuel(id: string, vehicleId: string, liters: number) {
  const { client } = await getDatabase(dbPath);
  await client.execute({
    sql: `INSERT INTO fuel_logs (id, vehicle_id, fill_date, odometer, liters, price_per_liter, total_cost, is_full_tank, notes, created_at, rev, seq, sync_ts, deleted)
          VALUES (?, ?, '2026-01-01', 100, ?, 5, ?, 1, NULL, ?, 1, 0, 0, 0)`,
    args: [id, vehicleId, liters, liters * 5, iso()],
  });
}

async function countRows(table: string, userId: string): Promise<number> {
  const { client } = await getDatabase(dbPath);
  const where = table === 'vehicles'
    ? 'user_id = ? AND deleted = 0'
    : 'vehicle_id IN (SELECT id FROM vehicles WHERE user_id = ? AND deleted = 0) AND deleted = 0';
  const res = await client.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, args: [userId] });
  return Number((res.rows[0] as any).n);
}

describe('backup & restore', () => {
  it('exports only the requesting user\'s rows', async () => {
    await seedUser('u1', 'u1@test.com');
    await seedUser('u2', 'u2@test.com');
    await seedVehicle('v1', 'u1', 'Mine', 100);
    await seedVehicle('v2', 'u2', 'Theirs', 200);
    await seedFuel('f1', 'v1', 40);

    const backup = await createBackup('u1', { dbPath });
    expect(backup.counts.vehicles).toBe(1);
    expect(backup.counts.fuel_logs).toBe(1);
    expect(backup.tables.vehicles[0].name).toBe('Mine');
    expect(JSON.stringify(backup)).not.toContain('Theirs');
  });

  it('merge restore recreates deleted rows and leaves existing ones alone', async () => {
    await seedUser('u1', 'u1@test.com');
    await seedVehicle('v1', 'u1', 'Corolla', 100);
    await seedFuel('f1', 'v1', 40);
    await seedFuel('f2', 'v1', 30);
    const backup = await createBackup('u1', { dbPath });

    const { client } = await getDatabase(dbPath);
    await client.execute({ sql: 'DELETE FROM fuel_logs WHERE id = ?', args: ['f2'] });

    const report = await restoreBackup(backup, 'u1', 'merge', { dbPath });
    expect(report.tables.fuel_logs).toEqual({ inserted: 1, skipped: 1 });
    expect(await countRows('fuel_logs', 'u1')).toBe(2);
  });

  it('merge restore never overwrites a newer local edit', async () => {
    await seedUser('u1', 'u1@test.com');
    await seedVehicle('v1', 'u1', 'Corolla', 100);
    const backup = await createBackup('u1', { dbPath });

    const { client } = await getDatabase(dbPath);
    await client.execute({ sql: 'UPDATE vehicles SET name = ? WHERE id = ?', args: ['Renamed After Backup', 'v1'] });

    await restoreBackup(backup, 'u1', 'merge', { dbPath });
    const res = await client.execute({ sql: 'SELECT name FROM vehicles WHERE id = ?', args: ['v1'] });
    expect((res.rows[0] as any).name).toBe('Renamed After Backup');
  });

  it('replace restore swaps the account contents', async () => {
    await seedUser('u1', 'u1@test.com');
    await seedVehicle('v1', 'u1', 'Old', 100);
    await seedFuel('f1', 'v1', 40);
    const backup = await createBackup('u1', { dbPath });

    await seedVehicle('v9', 'u1', 'Added Later', 900);
    await seedFuel('f9', 'v9', 20);

    const report = await restoreBackup(backup, 'u1', 'replace', { dbPath });
    expect(report.removed).toBeGreaterThan(0);
    expect(await countRows('vehicles', 'u1')).toBe(1);
    expect(await countRows('fuel_logs', 'u1')).toBe(1);
  });

  it('refuses to land rows under a vehicle the user does not own', async () => {
    await seedUser('u1', 'u1@test.com');
    await seedUser('u2', 'u2@test.com');
    await seedVehicle('v2', 'u2', 'Theirs', 50);

    const forged = parseBackup({
      kind: 'carbook-backup',
      version: 1,
      tables: { fuel_logs: [{ id: 'fX', vehicle_id: 'v2', liters: 40, total_cost: 200 }] },
    });

    const report = await restoreBackup(forged, 'u1', 'merge', { dbPath });
    expect(report.tables.fuel_logs).toEqual({ inserted: 0, skipped: 1 });
    const { client } = await getDatabase(dbPath);
    const res = await client.execute({ sql: 'SELECT id FROM fuel_logs WHERE id = ?', args: ['fX'] });
    expect(res.rows.length).toBe(0);
  });

  it('rejects a file that is not a CarBook backup', () => {
    expect(() => parseBackup({ tables: {} })).toThrow(/Not a CarBook backup/);
    expect(() => parseBackup({ kind: 'carbook-backup', version: 999, tables: {} })).toThrow(/newer CarBook version/);
  });

  it('restored rows are visible to other devices through the sync cursor', async () => {
    await seedUser('u1', 'u1@test.com');
    await seedVehicle('v1', 'u1', 'Corolla', 100);
    await seedFuel('f1', 'v1', 40);
    const backup = await createBackup('u1', { dbPath });

    const { client } = await getDatabase(dbPath);
    await client.execute({ sql: 'DELETE FROM fuel_logs WHERE id = ?', args: ['f1'] });
    const before = await createBackup('u1', { dbPath });
    expect(before.counts.fuel_logs).toBe(0);

    await restoreBackup(backup, 'u1', 'merge', { dbPath });
    const pulled = await runSync('u1', { deviceId: 'd2', since: 0 }, { dbPath });
    expect(pulled.pulled.fuel_logs?.upsert.find(r => r.id === 'f1')).toBeTruthy();
  });
});
