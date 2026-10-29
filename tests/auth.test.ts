import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signSessionToken, verifySessionToken } from '@/services/auth';
import { StorageRepository } from '@/persistence/repository';
import fs from 'fs';
import path from 'path';

describe('Google Auth & Multi-Tenancy Engine', () => {
  let testDbPath: string;
  let repo: StorageRepository;

  // A fixed filename is not enough: the previous test's handle can still be releasing
  // the file on Windows, so the unlink no-ops and rows leak forward. Unique per test.
  const removeDbFiles = (p: string) => {
    for (const ext of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(p + ext); } catch {}
    }
  };

  beforeEach(() => {
    testDbPath = path.resolve(process.cwd(), `test_auth_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    repo = new StorageRepository(testDbPath);
  });

  afterEach(async () => {
    await repo.close();
    removeDbFiles(testDbPath);
  });

  it('correctly signs and verifies session JWT tokens', () => {
    const user = {
      id: 'usr_google_123456789',
      email: 'owner@example.com',
      name: 'Car Owner',
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
    };

    const token = signSessionToken(user, 30);
    expect(token).toBeDefined();
    expect(token.split('.').length).toBe(3);

    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe(user.id);
    expect(verified?.email).toBe(user.email);
    expect(verified?.name).toBe(user.name);
  });

  it('rejects tampered or forged JWT tokens', () => {
    const user = {
      id: 'usr_attacker',
      email: 'hacker@example.com',
      name: 'Attacker',
      picture: null,
    };

    const token = signSessionToken(user, 30);
    const tampered = token.slice(0, -5) + 'XXXXX';
    const result = verifySessionToken(tampered);
    expect(result).toBeNull();
  });

  it('strictly isolates vehicles between different users (Multi-Tenancy)', async () => {
    // 1. Create User A and User B
    const userA = await repo.findOrCreateUser({
      id: 'google_user_a',
      email: 'userA@gmail.com',
      name: 'User A',
    });

    const userB = await repo.findOrCreateUser({
      id: 'google_user_b',
      email: 'userB@gmail.com',
      name: 'User B',
    });

    // 2. User A creates a car
    await repo.createVehicle({
      name: 'Car A',
      make: 'Toyota',
      model: 'Corolla',
      year: 2021,
      initialOdometer: 50000,
      currentOdometer: 50000,
    }, userA.id);

    // 3. User B creates a car
    await repo.createVehicle({
      name: 'Car B',
      make: 'Hyundai',
      model: 'Elantra',
      year: 2022,
      initialOdometer: 30000,
      currentOdometer: 30000,
    }, userB.id);

    // 4. Verify User A only sees Car A
    const vehiclesA = await repo.getAllVehicles(userA.id);
    expect(vehiclesA.length).toBe(1);
    expect(vehiclesA[0].name).toBe('Car A');

    // 5. Verify User B only sees Car B
    const vehiclesB = await repo.getAllVehicles(userB.id);
    expect(vehiclesB.length).toBe(1);
    expect(vehiclesB[0].name).toBe('Car B');
  });

  // The legacy sweep is deliberately gated to one address (see findOrCreateUser) so a
  // shared server can never hand one person's orphaned history to whoever signs in next.
  // These two tests pin that gate from both sides.
  it('does not claim legacy unassigned vehicles for a different account', async () => {
    await repo.createVehicle({
      name: 'Legacy Chevy',
      make: 'Chevrolet',
      model: 'Optra',
      year: 2011,
      initialOdometer: 218500,
      currentOdometer: 218500,
    });

    const stranger = await repo.findOrCreateUser({
      id: 'google_stranger_1',
      email: 'stranger@gmail.com',
      name: 'Stranger',
    });
    // The sweep only runs for a returning user, so sign in twice.
    await repo.findOrCreateUser({
      id: 'google_stranger_1',
      email: 'stranger@gmail.com',
      name: 'Stranger',
    });

    expect((await repo.getAllVehicles(stranger.id)).length).toBe(0);
  });

  it('claims legacy unassigned vehicles when the designated owner signs in again', async () => {
    await repo.createVehicle({
      name: 'Legacy Chevy',
      make: 'Chevrolet',
      model: 'Optra',
      year: 2011,
      initialOdometer: 218500,
      currentOdometer: 218500,
    });

    const owner = await repo.findOrCreateUser({
      id: 'google_owner_1',
      email: 'mkamel30@gmail.com',
      name: 'Owner',
    });
    // First login creates the row, so the claim lands on the next one.
    await repo.findOrCreateUser({
      id: 'google_owner_1',
      email: 'mkamel30@gmail.com',
      name: 'Owner',
    });

    const ownerCars = await repo.getAllVehicles(owner.id);
    expect(ownerCars.length).toBe(1);
    expect(ownerCars[0].name).toBe('Legacy Chevy');
    expect(ownerCars[0].userId).toBe(owner.id);
  });

  it('does not expose any vehicles or data to unauthenticated visitors', async () => {
    // Registered user
    const owner = await repo.findOrCreateUser({
      id: 'google_owner_secret',
      email: 'secret@example.com',
      name: 'Secret Owner',
    });

    // Car owned by that user
    await repo.createVehicle({
      name: 'Private Car',
      make: 'Nissan',
      model: 'Sunny',
      year: 2020,
      initialOdometer: 10000,
      currentOdometer: 10000,
    }, owner.id);

    // Unauthenticated visitor calls getAllVehicles with undefined
    const anonymousCars = await repo.getAllVehicles(undefined);
    expect(anonymousCars).toEqual([]);
  });
});
