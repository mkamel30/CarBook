// ONE BEHAVIOUR SUITE, BOTH ADAPTERS — the conformance half of the schedules
// domain core.
//
// The server (`src/persistence/repository.ts` + `src/app/api/**`) and the offline
// device (`mobile/src/offline/fetchBridge.ts`) are two storage ports over the same
// rules in `domain/schedulesCore.ts`. This file states the observable contract ONCE
// — seeding, log→item linking, forward-only baselines, `linkedFromLog` honesty and
// the odometer max — and each side runs it through its own adapter:
//   tests/schedulesConformance.server.test.ts   (real API routes + libsql)
//   mobile/src/offline/schedulesConformance.bridge.test.ts  (fetchBridge + WatermelonDB)
// A rule that drifts between the two fails here instead of on the phone.
//
// Not a *.test.ts file: it only runs when an adapter suite imports it.

import { describe, expect, it } from 'vitest';
import { FACTORY_ITEM_CODES, RETIRED_FACTORY_ITEM_CODES } from '../services/presets';
import type { EvaluatedSchedule } from './schedulesCore';

export interface ConformanceVehicle {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number;
  initialOdometer: number;
  currentOdometer: number;
}

export interface ConformanceLogInput {
  vehicleId: string;
  serviceDate: string;
  odometer: number;
  serviceType: string;
  title: string;
  totalCost: number;
  /** The log modal's optional explicit item link. */
  linkedItemCode?: string;
}

export interface ConformanceFuelInput {
  vehicleId: string;
  fillDate: string;
  odometer: number;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  isFullTank: boolean;
}

/** The HTTP-visible surface each side must offer. */
export interface SchedulesAdapter {
  /** Short label used in the generated test titles. */
  name: string;
  createVehicle(input: Omit<ConformanceVehicle, 'id'>): Promise<ConformanceVehicle>;
  readVehicle(id: string): Promise<ConformanceVehicle | null>;
  listSchedules(vehicleId: string): Promise<{ vehicle: { currentOdometer: number }; schedules: EvaluatedSchedule[] }>;
  removeSchedule(id: string): Promise<void>;
  addMaintenance(input: ConformanceLogInput): Promise<{ id: string; linkedSchedules: number }>;
  updateMaintenance(input: Partial<ConformanceLogInput> & { id: string }): Promise<{ linkedSchedules: number }>;
  deleteMaintenance(id: string): Promise<void>;
  addFuel(input: ConformanceFuelInput): Promise<{ id: string }>;
  deleteFuel(id: string): Promise<void>;
}

const BASE = {
  name: 'Conformance Corolla',
  make: 'Toyota',
  model: 'Corolla',
  year: 2019,
  initialOdometer: 10000,
  currentOdometer: 10000,
};

/** A vehicle that already carries the factory catalogue. */
async function freshVehicle(adapter: SchedulesAdapter): Promise<ConformanceVehicle> {
  const vehicle = await adapter.createVehicle(BASE);
  expect(vehicle.id).toBeTruthy();
  await adapter.listSchedules(vehicle.id);
  return vehicle;
}

function item(schedules: EvaluatedSchedule[], itemCode: string): EvaluatedSchedule {
  const found = schedules.find((s) => s.schedule.itemCode === itemCode);
  if (!found) throw new Error(`schedule ${itemCode} is not in the read result`);
  return found;
}

const logAt = (vehicleId: string, odometer: number, serviceType: string, extra: Partial<ConformanceLogInput> = {}): ConformanceLogInput => ({
  vehicleId,
  serviceDate: '2026-05-01',
  odometer,
  serviceType,
  title: `Service at ${odometer}`,
  totalCost: 500,
  ...extra,
});

export function describeSchedulesConformance(adapter: SchedulesAdapter): void {
  describe(`schedules conformance — ${adapter.name}`, () => {
    it('seeds the factory catalogue with no baseline at all', async () => {
      const vehicle = await adapter.createVehicle(BASE);
      const { schedules } = await adapter.listSchedules(vehicle.id);

      const codes = schedules.map((s) => s.schedule.itemCode);
      for (const code of FACTORY_ITEM_CODES) expect(codes).toContain(code);
      // A car without a differential must not be told it needs one.
      for (const retired of RETIRED_FACTORY_ITEM_CODES) expect(codes).not.toContain(retired);

      // Nothing was serviced: every item asks for a record and fabricates no km.
      for (const s of schedules) {
        expect(s.status).toBe('needs_record');
        expect(s.remainingKm).toBeNull();
        expect(s.schedule.lastDoneOdometer ?? null).toBeNull();
        expect(s.linkedFromLog).toBeUndefined();
      }

      // Idempotent: a second read does not double-seed.
      const again = await adapter.listSchedules(vehicle.id);
      expect(again.schedules).toHaveLength(schedules.length);
    });

    it('links an oil change to exactly the item it evidences', async () => {
      const vehicle = await freshVehicle(adapter);
      const created = await adapter.addMaintenance(logAt(vehicle.id, 15000, 'oil_change'));
      expect(created.linkedSchedules).toBe(1);

      const { schedules } = await adapter.listSchedules(vehicle.id);
      const oil = item(schedules, 'engine_oil_filter');
      expect(oil.schedule.lastDoneOdometer).toBe(15000);
      expect(oil.schedule.lastDoneDate).toBe('2026-05-01');
      expect(oil.status).not.toBe('needs_record');
      expect(oil.linkedFromLog).toEqual({ date: '2026-05-01', odo: 15000 });

      // Untouched siblings stay honest.
      expect(item(schedules, 'air_filter').status).toBe('needs_record');
      expect(item(schedules, 'brake_pads').status).toBe('needs_record');
    });

    it('links every item a periodic service evidences', async () => {
      const vehicle = await freshVehicle(adapter);
      const created = await adapter.addMaintenance(logAt(vehicle.id, 15000, 'periodic'));
      expect(created.linkedSchedules).toBe(2);

      const { schedules } = await adapter.listSchedules(vehicle.id);
      expect(item(schedules, 'engine_oil_filter').schedule.lastDoneOdometer).toBe(15000);
      expect(item(schedules, 'air_filter').schedule.lastDoneOdometer).toBe(15000);
    });

    it('honours the explicit item picked in the log modal', async () => {
      const vehicle = await freshVehicle(adapter);
      // 'other' derives nothing; the explicit choice is the only link.
      const created = await adapter.addMaintenance(
        logAt(vehicle.id, 15000, 'other', { linkedItemCode: 'brake_pads' }),
      );
      expect(created.linkedSchedules).toBe(1);

      const { schedules } = await adapter.listSchedules(vehicle.id);
      expect(item(schedules, 'brake_pads').schedule.lastDoneOdometer).toBe(15000);
      expect(item(schedules, 'engine_oil_filter').status).toBe('needs_record');
    });

    it('moves a baseline forward only', async () => {
      const vehicle = await freshVehicle(adapter);
      await adapter.addMaintenance(logAt(vehicle.id, 15000, 'oil_change'));

      // An older reading must not rewind the record…
      const older = await adapter.addMaintenance(logAt(vehicle.id, 12000, 'oil_change', { serviceDate: '2026-01-01' }));
      expect(older.linkedSchedules).toBe(0);
      expect(item((await adapter.listSchedules(vehicle.id)).schedules, 'engine_oil_filter').schedule.lastDoneOdometer).toBe(15000);

      // …and a newer one does.
      const newer = await adapter.addMaintenance(logAt(vehicle.id, 18000, 'oil_change', { serviceDate: '2026-09-01' }));
      expect(newer.linkedSchedules).toBe(1);
      const oil = item((await adapter.listSchedules(vehicle.id)).schedules, 'engine_oil_filter');
      expect(oil.schedule.lastDoneOdometer).toBe(18000);
      expect(oil.linkedFromLog).toEqual({ date: '2026-09-01', odo: 18000 });
    });

    it('re-links when an edited log reports a higher odometer', async () => {
      const vehicle = await freshVehicle(adapter);
      const created = await adapter.addMaintenance(logAt(vehicle.id, 15000, 'oil_change'));

      const updated = await adapter.updateMaintenance({ id: created.id, odometer: 16500, serviceDate: '2026-06-15' });
      expect(updated.linkedSchedules).toBe(1);
      const oil = item((await adapter.listSchedules(vehicle.id)).schedules, 'engine_oil_filter');
      expect(oil.schedule.lastDoneOdometer).toBe(16500);
      expect(oil.linkedFromLog).toEqual({ date: '2026-06-15', odo: 16500 });
    });

    it('leaves the baseline alone when the log behind it is deleted', async () => {
      const vehicle = await freshVehicle(adapter);
      const created = await adapter.addMaintenance(logAt(vehicle.id, 15000, 'oil_change'));
      await adapter.deleteMaintenance(created.id);

      const oil = item((await adapter.listSchedules(vehicle.id)).schedules, 'engine_oil_filter');
      // Deleting a record never invents, clears or rewinds a service…
      expect(oil.schedule.lastDoneOdometer).toBe(15000);
      // …and the marker that claimed "a log proves this" goes, because it no longer does.
      expect(oil.linkedFromLog).toBeUndefined();
    });

    it('keeps the vehicle odometer at the highest live reading', async () => {
      const vehicle = await freshVehicle(adapter);
      await adapter.addMaintenance(logAt(vehicle.id, 15000, 'oil_change'));

      const fill = await adapter.addFuel({
        vehicleId: vehicle.id, fillDate: '2026-07-01', odometer: 21000,
        liters: 40, pricePerLiter: 12, totalCost: 480, isFullTank: true,
      });
      expect((await adapter.readVehicle(vehicle.id))?.currentOdometer).toBe(21000);

      // Removing the highest reading recomputes across what is left.
      await adapter.deleteFuel(fill.id);
      expect((await adapter.readVehicle(vehicle.id))?.currentOdometer).toBe(15000);
    });

    it('does not re-seed an item the owner removed', async () => {
      const vehicle = await freshVehicle(adapter);
      const before = (await adapter.listSchedules(vehicle.id)).schedules;
      const removed = item(before, 'air_filter');

      await adapter.removeSchedule(removed.schedule.id!);
      const after = await adapter.listSchedules(vehicle.id);

      expect(after.schedules).toHaveLength(before.length - 1);
      expect(after.schedules.map((s) => s.schedule.itemCode)).not.toContain('air_filter');
    });
  });
}
