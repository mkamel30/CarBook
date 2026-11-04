import { describe, it, expect, afterEach } from 'vitest';
import { onDeviceWrite, notifyDeviceWrite, __clearDeviceWriteListeners } from './writeEvents';
import { makeDatabase } from './database';
import { localCreate, localUpdate, localMarkDeleted, localRestore } from './writer';

afterEach(() => __clearDeviceWriteListeners());

function vehicleFields(name: string) {
  return {
    name, make: 'Toyota', model: 'Corolla', year: 2019,
    initial_odometer: 0, current_odometer: 0,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

describe('device write-event bus', () => {
  it('notifies subscribers and stops after teardown', () => {
    let hits = 0;
    const off = onDeviceWrite(() => { hits++; });
    notifyDeviceWrite();
    expect(hits).toBe(1);
    off();
    notifyDeviceWrite();
    expect(hits).toBe(1);
  });

  it('swallows a throwing subscriber so the committed write never fails', () => {
    let after = 0;
    onDeviceWrite(() => { throw new Error('bad subscriber'); });
    onDeviceWrite(() => { after++; });
    expect(() => notifyDeviceWrite()).not.toThrow();
    expect(after).toBe(1);
  });

  it('every writer funnels through the bus (the single choke point)', async () => {
    const db = makeDatabase();
    let hits = 0;
    onDeviceWrite(() => { hits++; });

    await localCreate(db, 'vehicles', 'v1', vehicleFields('X'), 1000);
    expect(hits).toBe(1);

    await localUpdate(db, 'vehicles', 'v1', { name: 'Y' }, 1500);
    expect(hits).toBe(2);

    await localMarkDeleted(db, 'vehicles', 'v1', 2000);
    expect(hits).toBe(3);

    // Restore of an absent row takes the create branch; both fire once.
    await localRestore(db, 'vehicles', 'v2', vehicleFields('Z'), 2500);
    expect(hits).toBe(4);
  });
});
