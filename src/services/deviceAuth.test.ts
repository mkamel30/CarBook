import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDatabase } from '../persistence/db';
import { verifySessionToken } from './auth';
import { runSync } from '../persistence/sync';
import { linkGuestToUser, refreshDeviceSession, registerDevice, revokeDeviceSession } from './deviceAuth';

let dbPath: string;
const iso = () => new Date().toISOString();

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `carbook_device_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
});

afterEach(() => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

async function seedRealUser(id = 'real1') {
  const { client } = await getDatabase(dbPath);
  await client.execute({
    sql: 'INSERT INTO users (id, email, name, picture, created_at, last_login_at, is_guest) VALUES (?, ?, ?, NULL, ?, ?, 0)',
    args: [id, `${id}@example.com`, 'Real Person', iso(), iso()],
  });
  return id;
}

async function user(id: string): Promise<any> {
  const { client } = await getDatabase(dbPath);
  const res = await client.execute({ sql: 'SELECT id, email, name, picture, is_guest FROM users WHERE id = ?', args: [id] });
  return res.rows[0] ?? null;
}

const DEVICE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const OTHER = 'z9y8x7w6-v5u4-4t3s-2r1q-p0o9n8m7l6k5';

describe('device sessions', () => {
  it('registers a device as a guest whose access token verifies', async () => {
    const session = await registerDevice(DEVICE, { dbPath });

    expect(session.user.guest).toBe(true);
    const verified = verifySessionToken(session.accessToken);
    expect(verified?.id).toBe(`guest:${DEVICE}`);
    expect(verified?.guest).toBe(true);

    const row = await user(`guest:${DEVICE}`);
    expect(Number(row.is_guest)).toBe(1);
    expect(row.email).toContain('@device.invalid');
  });

  it('rejects a malformed device id instead of interpolating it', async () => {
    await expect(registerDevice("guest:x'); DROP TABLE users;--", { dbPath })).rejects.toThrow(/deviceId/);
  });

  it('rotates the refresh token and revokes every session when an old one is replayed', async () => {
    const first = await registerDevice(DEVICE, { dbPath });
    const second = await refreshDeviceSession(DEVICE, first.refreshToken, { dbPath });

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(verifySessionToken(second.accessToken)?.id).toBe(first.user.id);

    await expect(refreshDeviceSession(DEVICE, first.refreshToken, { dbPath })).rejects.toThrow(/reuse detected/);
    // the stolen-token path means the live token is dead too
    await expect(refreshDeviceSession(DEVICE, second.refreshToken, { dbPath })).rejects.toThrow();
  });

  it('keeps two devices signed in at the same time', async () => {
    const real = await seedRealUser();
    const phone = await linkGuestToUser(DEVICE, real, { dbPath });
    const desktop = await linkGuestToUser(OTHER, real, { dbPath });

    const a = await refreshDeviceSession(DEVICE, phone.refreshToken, { dbPath });
    const b = await refreshDeviceSession(OTHER, desktop.refreshToken, { dbPath });
    expect(a.user.id).toBe(real);
    expect(b.user.id).toBe(real);

    // signing the desktop out must not disturb the phone
    await revokeDeviceSession(real, b.sessionId, { dbPath });
    const again = await refreshDeviceSession(DEVICE, a.refreshToken, { dbPath });
    expect(again.user.id).toBe(real);
  });
});

describe('guest to account linking', () => {
  it('moves guest data onto the account and re-publishes it to other devices', async () => {
    const real = await seedRealUser();
    const guest = await registerDevice(DEVICE, { dbPath });

    // The device writes data as itself, exactly as it would before ever signing in.
    const vehicle = {
      id: 'v1', name: 'Corolla', make: 'Toyota', model: 'Corolla', year: 2020,
      license_plate: null, initial_odometer: 0, current_odometer: 218500,
      recommended_oil: null, specs: null, created_at: iso(), updated_at: iso(), updatedAt: 1000,
    };
    const fuel = {
      id: 'f1', vehicle_id: 'v1', fill_date: '2026-01-01', odometer: 218500, liters: 15.73,
      price_per_liter: 22.25, total_cost: 350, is_full_tank: 0, notes: null,
      created_at: iso(), updatedAt: 1000,
    };
    await runSync(guest.user.id, {
      deviceId: DEVICE, since: 0, pushed: { vehicles: { upsert: [vehicle] }, fuel_logs: { upsert: [fuel] } },
    }, { dbPath });

    const result = await linkGuestToUser(DEVICE, real, { dbPath });
    expect(result.movedVehicles).toBe(1);

    const { client } = await getDatabase(dbPath);
    const vOwner = await client.execute({ sql: 'SELECT user_id FROM vehicles WHERE id = ?', args: ['v1'] });
    expect((vOwner.rows[0] as any).user_id).toBe(real);
    expect(await user(`guest:${DEVICE}`)).toBeNull();

    // The account's other devices must receive both the vehicle and its logs.
    const pulled = await runSync(real, { deviceId: OTHER, since: 0 }, { dbPath });
    expect(pulled.pulled.vehicles?.upsert.find(r => r.id === 'v1')).toBeTruthy();
    expect(pulled.pulled.fuel_logs?.upsert.find(r => r.id === 'f1')).toBeTruthy();
  });

  it('is idempotent for a device with nothing to move', async () => {
    const real = await seedRealUser();
    await registerDevice(DEVICE, { dbPath });
    const first = await linkGuestToUser(DEVICE, real, { dbPath });
    const second = await linkGuestToUser(DEVICE, real, { dbPath });
    expect(first.movedVehicles).toBe(0);
    expect(second.movedVehicles).toBe(0);
    expect(second.user.id).toBe(real);
  });

  it('refuses to link into a guest or a missing account', async () => {
    const guest = await registerDevice(DEVICE, { dbPath });
    await expect(linkGuestToUser(DEVICE, 'nobody', { dbPath })).rejects.toThrow(/does not exist/);
    await expect(linkGuestToUser(DEVICE, guest.user.id, { dbPath })).rejects.toThrow(/another guest/);
  });
});
