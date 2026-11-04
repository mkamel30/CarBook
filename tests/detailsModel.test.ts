import { describe, it, expect } from 'vitest';
import {
  planDetailsEffects,
  hasNoSpecs,
  isCompleteBatch,
  type DetailsBatch,
} from '@/hooks/detailsModel';

function batch(overrides: Partial<DetailsBatch> = {}): DetailsBatch {
  return {
    vehicleId: 'v1',
    fuelOk: true,
    fuelLogs: [{ odometer: 100, fillDate: '2026-11-01' }],
    maintenanceOk: true,
    maintenanceLogs: [{ id: 'm1' }],
    schedulesOk: true,
    schedules: [{ id: 's1', status: 'ok' }],
    schedulesVehicleName: 'Corolla',
    schedulesVehicleOdometer: 43210,
    reportOk: true,
    reportData: { vehicle: { specs: { engine: '1.8' } } },
    ...overrides,
  };
}

describe('planDetailsEffects', () => {
  it('a complete success writes all four slices and notifies', () => {
    const plan = planDetailsEffects(batch(), {
      vehicleNameFallback: '', lang: 'ar', selectedVehicleHasNoSpecs: true,
    });
    expect(plan.fuelLogs).toHaveLength(1);
    expect(plan.maintenanceLogs).toHaveLength(1);
    expect(plan.schedules).toHaveLength(1);
    expect(plan.reportData).toBeDefined();
    expect(plan.notify?.vehicleName).toBe('Corolla');
    expect(plan.notify?.usage).toHaveLength(1);
    expect(plan.notify?.currentOdometer).toBe(43210);
    expect(plan.specs).toEqual({ engine: '1.8' });
  });

  it('a failed slice is left null so it never overwrites the previous good data', () => {
    const plan = planDetailsEffects(batch({ fuelOk: false, fuelLogs: [] }), {
      vehicleNameFallback: '', lang: 'ar', selectedVehicleHasNoSpecs: false,
    });
    expect(plan.fuelLogs).toBeNull();
    expect(plan.maintenanceLogs).toHaveLength(1);
    expect(plan.notify).not.toBeNull();
  });

  it('schedules failure suppresses the notification entirely', () => {
    const plan = planDetailsEffects(batch({ schedulesOk: false, schedules: [] }), {
      vehicleNameFallback: 'Fallback', lang: 'ar', selectedVehicleHasNoSpecs: false,
    });
    expect(plan.notify).toBeNull();
    expect(plan.schedules).toBeNull();
  });

  it('vehicle name falls back when the schedules payload has none', () => {
    const plan = planDetailsEffects(batch({ schedulesVehicleName: '' }), {
      vehicleNameFallback: 'Fallback', lang: 'ar', selectedVehicleHasNoSpecs: false,
    });
    expect(plan.notify?.vehicleName).toBe('Fallback');
  });

  it('never patches specs onto a vehicle that already has them', () => {
    const plan = planDetailsEffects(batch(), {
      vehicleNameFallback: '', lang: 'ar', selectedVehicleHasNoSpecs: false,
    });
    expect(plan.specs).toBeNull();
  });

  it('no report specs means no specs patch even when the vehicle lacks them', () => {
    const plan = planDetailsEffects(batch({ reportData: { vehicle: {} } }), {
      vehicleNameFallback: '', lang: 'ar', selectedVehicleHasNoSpecs: true,
    });
    expect(plan.specs).toBeNull();
  });
});

describe('hasNoSpecs', () => {
  it('treats a null vehicle as having specs (no patch)', () => {
    expect(hasNoSpecs(null)).toBe(false);
  });
  it('missing specs field counts as no specs', () => {
    expect(hasNoSpecs({})).toBe(true);
  });
  it('an empty specs object counts as no specs', () => {
    expect(hasNoSpecs({ specs: {} })).toBe(true);
  });
  it('a populated specs object counts as having specs', () => {
    expect(hasNoSpecs({ specs: { engine: '1.8' } })).toBe(false);
  });
});

describe('isCompleteBatch', () => {
  it('true only when all four reads succeeded', () => {
    expect(isCompleteBatch(batch())).toBe(true);
    expect(isCompleteBatch(batch({ fuelOk: false }))).toBe(false);
    expect(isCompleteBatch(batch({ maintenanceOk: false }))).toBe(false);
    expect(isCompleteBatch(batch({ schedulesOk: false }))).toBe(false);
    expect(isCompleteBatch(batch({ reportOk: false }))).toBe(false);
  });
});
