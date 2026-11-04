import { describe, it, expect } from 'vitest';
import {
  resolveNextVehicle,
  selectBodyMode,
  countUrgentSchedules,
  shouldShowUrgentBanner,
  minOdometerFor,
} from '@/hooks/workbenchModel';

describe('resolveNextVehicle — selection identity rule', () => {
  it('an empty list clears the selection', () => {
    expect(resolveNextVehicle({ id: 'a' }, [])).toBeNull();
  });

  it('no previous selection takes the first vehicle', () => {
    expect(resolveNextVehicle(null, [{ id: 'a' }, { id: 'b' }])).toMatchObject({ id: 'a' });
  });

  it('keeps the SAME object when the id and odometer are unchanged (no double load)', () => {
    const prev = { id: 'a', currentOdometer: 100 };
    const next = resolveNextVehicle(prev, [{ id: 'a', currentOdometer: 100 }]);
    expect(next).toBe(prev);
  });

  it('returns a new object when the odometer moved', () => {
    const prev = { id: 'a', currentOdometer: 100 };
    const next = resolveNextVehicle(prev, [{ id: 'a', currentOdometer: 150 }]);
    expect(next).not.toBe(prev);
    expect(next.currentOdometer).toBe(150);
  });

  it('falls back to the first vehicle when the previous id is gone', () => {
    const prev = { id: 'gone', currentOdometer: 100 };
    const next = resolveNextVehicle(prev, [{ id: 'a' }, { id: 'b' }]);
    expect(next.id).toBe('a');
  });
});

describe('selectBodyMode — tab body branch', () => {
  const base = {
    loading: false, initialLoadDone: true, initialLoadError: null,
    vehicleCount: 1, hasSelectedVehicle: true, activeTab: 'overview',
  };

  it('shows the skeleton only during the first load', () => {
    expect(selectBodyMode({ ...base, loading: true, initialLoadDone: false })).toBe('skeleton');
    expect(selectBodyMode({ ...base, loading: true, initialLoadDone: true })).toBe('tabs');
  });

  it('a failed first fetch with no vehicles shows the retry panel, never first-run', () => {
    expect(selectBodyMode({ ...base, initialLoadError: 'boom', vehicleCount: 0, hasSelectedVehicle: false })).toBe('loadError');
  });

  it('the settings tab is reachable even with a load error and no vehicles', () => {
    expect(selectBodyMode({ ...base, initialLoadError: 'boom', vehicleCount: 0, hasSelectedVehicle: false, activeTab: 'settings' })).toBe('tabs');
  });

  it('no selection shows first-run', () => {
    expect(selectBodyMode({ ...base, hasSelectedVehicle: false })).toBe('firstRun');
  });
});

describe('countUrgentSchedules', () => {
  it('counts only overdue and due_soon', () => {
    const schedules = [
      { status: 'overdue' }, { status: 'due_soon' }, { status: 'ok' },
      { status: 'needs_record' }, { status: 'overdue' },
    ];
    expect(countUrgentSchedules(schedules)).toBe(3);
  });
});

describe('shouldShowUrgentBanner', () => {
  it('needs a vehicle, an urgent item, and a tab other than alerts', () => {
    expect(shouldShowUrgentBanner({ hasSelectedVehicle: true, urgentCount: 1, activeTab: 'overview' })).toBe(true);
    expect(shouldShowUrgentBanner({ hasSelectedVehicle: false, urgentCount: 1, activeTab: 'overview' })).toBe(false);
    expect(shouldShowUrgentBanner({ hasSelectedVehicle: true, urgentCount: 0, activeTab: 'overview' })).toBe(false);
    expect(shouldShowUrgentBanner({ hasSelectedVehicle: true, urgentCount: 1, activeTab: 'alerts' })).toBe(false);
  });
});

describe('minOdometerFor', () => {
  it('editing allows the stored (older) reading, a new log starts at the vehicle odometer', () => {
    expect(minOdometerFor('x', { currentOdometer: 5000 })).toBe(0);
    expect(minOdometerFor(null, { currentOdometer: 5000 })).toBe(5000);
    expect(minOdometerFor(null, null)).toBe(0);
  });
});
