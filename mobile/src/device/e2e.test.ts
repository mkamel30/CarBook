import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDatabase } from '../../../src/persistence/db';
import { runSync } from '../../../src/persistence/sync';
import { syncOnce } from '../../../src/sync/client';
import { makeDatabase } from './database';
import { WMDBLocalStore } from './localStore';
import { localCreate, localUpdate, localMarkDeleted } from './writer';

let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `carbook_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
});
afterEach(() => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

async function seedUser(id: string) {
  const { client } = await getDatabase(dbPath);
  const now = new Date().toISOString();
  await client.execute({
    sql: 'INSERT INTO users (id, email, name, picture, created_at, last_login_at) VALUES (?, ?, ?, NULL, ?, ?)',
    args: [id, `${id}@test.com`, 'T', now, now],
  });
}

// In-process transport: the client POSTs /api/sync, we hand the body straight to
// the real server engine. No HTTP, no mocks of the contract itself.
function fetchToServer(userId: string) {
  return (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    const data = await runSync(userId, body, { dbPath });
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
  }) as typeof fetch;
}

const iso = () => new Date().toISOString();
async function vehiclesOf(db: any) {
  return (await db.collections.get('vehicles').query().fetch()) as any[];
}

describe('device ⇄ server offline sync (end-to-end)', () => {
  it('syncs an offline-created vehicle to the server and a second device', async () => {
    await seedUser('u1');

    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', {
      name: 'Offline Corolla', make: 'Toyota', model: 'Corolla', year: 2019,
      initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso(),
    }, 1000);

    const outA = await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });
    expect(outA.pushedCount).toBe(1);

    const dbB = makeDatabase();
    const outB = await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });
    expect(outB.pulledCount).toBeGreaterThan(0);

    const onB = (await vehiclesOf(dbB)).find(v => v.id === 'veh-1');
    expect(onB?.name).toBe('Offline Corolla');
  });

  it('propagates an offline edit via last-write-wins', async () => {
    await seedUser('u1');
    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', { name: 'Original', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 1000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    await localUpdate(dbA, 'vehicles', 'veh-1', { name: 'Renamed' }, 2000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    const dbB = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });
    expect((await vehiclesOf(dbB)).find(v => v.id === 'veh-1')?.name).toBe('Renamed');
  });

  it('honours last-write-wins when a device pushes a stale edit', async () => {
    await seedUser('u1');
    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', { name: 'Newest', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 5000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    // Device B, offline, edited earlier (ts 1000) but syncs later — must NOT win.
    const dbB = makeDatabase();
    await localCreate(dbB, 'vehicles', 'veh-1', { name: 'Stale', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 1000);
    await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });

    const dbCheck = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbCheck), { baseUrl: 'http://s', deviceId: 'devC', fetchImpl: fetchToServer('u1') });
    expect((await vehiclesOf(dbCheck)).find(v => v.id === 'veh-1')?.name).toBe('Newest');
  });

  it('propagates an offline delete to a peer device', async () => {
    await seedUser('u1');
    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', { name: 'Doomed', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 1000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    const dbB = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });
    expect((await vehiclesOf(dbB)).find(v => v.id === 'veh-1')).toBeTruthy();

    await localMarkDeleted(dbA, 'vehicles', 'veh-1', 2000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    await syncOnce(new WMDBLocalStore(dbB), { baseUrl: 'http://s', deviceId: 'devB', fetchImpl: fetchToServer('u1') });
    expect((await vehiclesOf(dbB)).find(v => v.id === 'veh-1')).toBeUndefined();
  });

  it('isolates one user’s data from another', async () => {
    await seedUser('u1');
    await seedUser('u2');
    const dbA = makeDatabase();
    await localCreate(dbA, 'vehicles', 'veh-1', { name: 'Private', make: 'Toyota', model: 'A', year: 2020, initial_odometer: 0, current_odometer: 0, created_at: iso(), updated_at: iso() }, 1000);
    await syncOnce(new WMDBLocalStore(dbA), { baseUrl: 'http://s', deviceId: 'devA', fetchImpl: fetchToServer('u1') });

    const dbOther = makeDatabase();
    await syncOnce(new WMDBLocalStore(dbOther), { baseUrl: 'http://s', deviceId: 'devX', fetchImpl: fetchToServer('u2') });
    expect(await vehiclesOf(dbOther)).toHaveLength(0);
  });
});
