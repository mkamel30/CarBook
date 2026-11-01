import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from '@nozbe/watermelondb';
import { makeDatabase } from '@device/database';
import { WMDBLocalStore } from '@device/localStore';
import { createFetchBridge, type FetchHandler } from './fetchBridge';
import { makeMemorySettingsStore } from './settingsStore';
import {
  BACKUP_COLUMNS,
  BACKUP_KIND,
  BACKUP_TABLE_ORDER,
  BACKUP_VERSION,
  MAX_RESTORE_BYTES,
  applyBackupDocument,
  backupByteSize,
  buildBackupDocument,
  parseBackupDocument,
} from './localBackup';
import { DEFAULT_MAX_SNAPSHOT_BYTES } from './lokiPersistence';
// Drift guards: the SERVER's own backup contract, imported only by tests so
// libsql can never leak into the APK bundle.
import { SYNC_TABLES } from '@app/persistence/sync';
import { parseBackup as serverParseBackup } from '@app/services/backup';

const NOW = new Date('2024-06-01T12:00:00.000Z');

let db: Database;
let bridge: FetchHandler;

beforeEach(() => {
  db = makeDatabase();
  bridge = createFetchBridge({ db, settings: makeMemorySettingsStore(), now: () => NOW });
});

const env = async (res: Response) => res.json();

async function seedVehicleWithRows(): Promise<string> {
  const vehicle = (await env(await bridge('/api/vehicles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Backup Corolla', make: 'Toyota', model: 'Corolla', year: 2019,
      initialOdometer: 10000, currentOdometer: 12000, recommendedOil: '5W-30',
      specs: { engineOilViscosity: '0W-20' },
    }),
  }))).data;

  await bridge('/api/fuel', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vehicleId: vehicle.id, fillDate: '2024-05-01', odometer: 12000, liters: 30,
      pricePerLiter: 20, totalCost: 600, isFullTank: true, notes: 'gasoline_92',
    }),
  });
  await bridge('/api/maintenance', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vehicleId: vehicle.id, serviceDate: '2024-05-02', odometer: 12010,
      serviceType: 'oil_change', title: 'Oil', partsList: [{ name: 'Filter', condition: 'new', cost: 100 }],
      partsCost: 100, laborCost: 50, totalCost: 150, workshop: 'Nazza',
    }),
  });
  // The bridge seeds presets lazily on the first schedules read.
  await bridge(`/api/schedules?vehicleId=${vehicle.id}`);
  return vehicle.id;
}

describe('offline backup document: parity with src/services/backup.ts', () => {
  it('declares exactly the server table set, order, kind and version', () => {
    expect(BACKUP_KIND).toBe('carbook-backup');
    expect(BACKUP_VERSION).toBe(1);
    expect([...BACKUP_TABLE_ORDER]).toEqual(['vehicles', 'maintenance_schedules', 'maintenance_logs', 'fuel_logs']);
    for (const table of BACKUP_TABLE_ORDER) {
      expect(Object.keys(SYNC_TABLES)).toContain(table);
      // Same columns, same order, as the server's own contract.
      expect(BACKUP_COLUMNS[table]).toEqual(SYNC_TABLES[table].columns);
    }
  });

  it('emits a document the server parser accepts, with server-shaped rows', async () => {
    const vehicleId = await seedVehicleWithRows();
    const res = await bridge('/api/backup');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="carbook-backup-2024-06-01.json"');

    const doc = await res.json();
    // RAW document, like the server route — not the {success,data} envelope.
    expect(doc.success).toBeUndefined();
    expect(doc).toMatchObject({ kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: NOW.toISOString() });

    const counts = doc.counts as Record<string, number>;
    expect(counts.vehicles).toBe(1);
    expect(counts.fuel_logs).toBe(1);
    expect(counts.maintenance_logs).toBe(1);
    expect(counts.maintenance_schedules).toBeGreaterThan(0);

    const v = doc.tables.vehicles[0];
    expect(Object.keys(v)).toEqual(['id', ...SYNC_TABLES.vehicles.columns]);
    expect(v).toMatchObject({
      id: vehicleId, name: 'Backup Corolla', year: 2019,
      // 12010: the maintenance log above moved the odometer, exactly as the
      // server's atomic max-odometer rule does.
      initial_odometer: 10000, current_odometer: 12010, recommended_oil: '5W-30',
    });
    // JSON columns stay JSON TEXT, exactly as the server's SQLite stores them.
    expect(typeof v.specs).toBe('string');
    expect(JSON.parse(v.specs)).toEqual({ engineOilViscosity: '0W-20' });
    expect(doc.tables.fuel_logs[0].is_full_tank).toBe(1);
    expect(JSON.parse(doc.tables.maintenance_logs[0].parts_list)).toHaveLength(1);

    // The server's own parser accepts it unchanged, and reports the same counts.
    const reparsed = serverParseBackup(doc);
    expect(Object.keys(reparsed.tables).sort()).toEqual(Object.keys(doc.tables).sort());
    for (const table of BACKUP_TABLE_ORDER) {
      expect(reparsed.tables[table]).toHaveLength(doc.tables[table].length);
    }
  });

  it('round-trips export -> restore on another device without losing a row', async () => {
    await seedVehicleWithRows();
    const doc = await (await bridge('/api/backup')).json();
    const source = await env(await bridge('/api/vehicles'));

    const target = makeDatabase();
    const targetBridge = createFetchBridge({ db: target, settings: makeMemorySettingsStore(), now: () => NOW });
    const report = await env(await targetBridge('/api/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: doc, mode: 'merge' }),
    }));
    expect(report.success).toBe(true);
    expect(report.data.tables.vehicles.inserted).toBe(1);

    const restored = await env(await targetBridge('/api/vehicles'));
    expect(restored.data).toHaveLength(source.data.length);
    expect(restored.data[0]).toMatchObject(source.data[0]);
    const fuel = await env(await targetBridge(`/api/fuel?vehicleId=${source.data[0].id}`));
    expect(fuel.data[0]).toMatchObject({ liters: 30, totalCost: 600, isFullTank: true });
  });
});

describe('offline restore semantics', () => {
  it('merge marks every restored row dirty so it syncs up to the server', async () => {
    await seedVehicleWithRows();
    const doc = await (await bridge('/api/backup')).json();

    const target = makeDatabase();
    await applyBackupDocument(target, parseBackupDocument(doc), 'merge', NOW.getTime());

    const store = new WMDBLocalStore(target);
    const dirty = await store.collectDirty();
    expect(dirty.vehicles?.upsert).toHaveLength(1);
    expect(dirty.fuel_logs?.upsert?.[0]).toMatchObject({ liters: 30, is_full_tank: 1 });
    expect(dirty.maintenance_logs?.upsert?.[0].parts_list).toEqual([{ name: 'Filter', condition: 'new', cost: 100 }]);
    expect(dirty.maintenance_schedules?.upsert?.length).toBeGreaterThan(0);
    expect(dirty.vehicles?.upsert?.[0].updatedAt).toBe(NOW.getTime());
  });

  it('merge never overwrites a row the device already has, and counts the skip', async () => {
    await seedVehicleWithRows();
    const doc = await (await bridge('/api/backup')).json();
    const before = await env(await bridge('/api/vehicles'));

    const report = await env(await bridge('/api/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: doc, mode: 'merge' }),
    }));
    expect(report.data.tables.vehicles).toEqual({ inserted: 0, skipped: 1 });
    expect(report.data.removed).toBe(0);
    const after = await env(await bridge('/api/vehicles'));
    expect(after.data).toEqual(before.data);
  });

  it('replace retires rows the file does not mention as pushable tombstones', async () => {
    const keepId = await seedVehicleWithRows();
    const doc = await (await bridge('/api/backup')).json();

    // A second vehicle that the backup does not contain.
    const extra = (await env(await bridge('/api/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Stray', make: 'Nissan', model: 'Sentra', year: 2021, initialOdometer: 1, currentOdometer: 1 }),
    }))).data;
    const store = new WMDBLocalStore(db);
    await store.collectDirty(); // clear the pending snapshot from the setup writes

    const report = await env(await bridge('/api/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: doc, mode: 'replace' }),
    }));
    expect(report.success).toBe(true);
    expect(report.data.mode).toBe('replace');
    expect(report.data.removed).toBeGreaterThanOrEqual(1);

    const list = await env(await bridge('/api/vehicles'));
    expect(list.data.map((v: any) => v.id)).toEqual([keepId]);

    const dirty = await store.collectDirty();
    expect(dirty.vehicles?.delete?.map((d: any) => d.id)).toContain(extra.id);
  });

  it('skips a child whose vehicle is not present, exactly like the server', async () => {
    const doc = await buildBackupDocument(db, () => NOW);
    doc.tables.fuel_logs = [{
      id: 'orphan-log', vehicle_id: 'no-such-vehicle', fill_date: '2024-01-01', odometer: 1,
      liters: 1, price_per_liter: 1, total_cost: 1, is_full_tank: 1, notes: null, created_at: null,
    }];
    const report = await applyBackupDocument(db, doc, 'merge', NOW.getTime());
    expect(report.tables.fuel_logs).toEqual({ inserted: 0, skipped: 1 });
  });

  it('rejects a non-backup payload with the server error strings', async () => {
    const bad = await env(await bridge('/api/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: { hello: 'world' } }),
    }));
    expect(bad.success).toBe(false);
    expect(bad.error).toBe('Not a CarBook backup file.');

    const notAnObject = await bridge('/api/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: null }),
    });
    expect(notAnObject.status).toBe(400);
    expect((await env(notAnObject)).error).toBe('Not a valid backup file.');

    const wrongKind = await bridge('/api/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: { kind: 'other', tables: {} } }),
    });
    expect(wrongKind.status).toBe(400);
    expect((await env(wrongKind)).error).toBe('Not a CarBook backup file.');

    const badMode = await bridge('/api/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: { kind: BACKUP_KIND, tables: {} }, mode: 'yolo' }),
    });
    expect(badMode.status).toBe(400);
    expect((await env(badMode)).error).toBe('mode must be one of merge, replace');
  });

  it('refuses a restore larger than the persistence budget before touching the db', async () => {
    const doc = await buildBackupDocument(db, () => NOW);
    // Pad one row past the 4MB snapshot budget the LokiJS adapter enforces.
    const pad = 'x'.repeat(MAX_RESTORE_BYTES);
    doc.tables.vehicles = [{ id: 'huge', name: pad }];

    const res = await bridge('/api/backup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: doc, mode: 'merge' }),
    });
    expect(res.status).toBe(413);
    const body = await env(res);
    expect(body.success).toBe(false);
    expect(body.code).toBe('BACKUP_TOO_LARGE');
    expect((await env(await bridge('/api/vehicles'))).data).toHaveLength(0);
  });

  it('keeps a realistic export inside the snapshot budget', async () => {
    const vehicleId = await seedVehicleWithRows();
    // A heavy but ordinary year of fuel logs, then measure the whole document.
    for (let i = 0; i < 60; i++) {
      await bridge('/api/fuel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId, fillDate: `2024-0${1 + (i % 9)}-01`, odometer: 13000 + i * 400,
          liters: 32, pricePerLiter: 20, totalCost: 640, isFullTank: true,
        }),
      });
    }
    const doc = await buildBackupDocument(db, () => NOW);
    expect(doc.counts.fuel_logs).toBe(61);
    const bytes = backupByteSize(doc);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(DEFAULT_MAX_SNAPSHOT_BYTES);
  });
});
