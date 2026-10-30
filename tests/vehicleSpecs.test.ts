import { describe, it, expect } from 'vitest';
import { findPreseededVehicle, generateHeuristicSpecs } from '@/services/automotiveDatabase';

// The pre-seeded table is the answer the app gives without calling any AI, so a
// loose match here silently hands the owner the wrong capacity or interval. Suffix
// variants (Corolla Cross, Tucson Hybrid, Sportage GT-Line) share a prefix with a
// catalogued model and must fall through to the heuristic instead.
describe('pre-seeded vehicle lookup', () => {
  it('returns the catalogued record on an exact make, model and in-range year', () => {
    const hit = findPreseededVehicle('Toyota', 'Corolla', 2020);
    expect(hit).not.toBeNull();
    expect(hit?.specs.engineOilCapacityLiters).toContain('4.2');
    expect(hit?.schedules.maintenanceItems.map(i => i.itemCode)).toContain('cvt_fluid');
  });

  it('ignores case and surrounding or repeated spaces', () => {
    const exact = findPreseededVehicle('Toyota', 'Corolla', 2020);
    expect(findPreseededVehicle('  tOyOtA ', ' corolla ', 2020)).toBe(exact);
    expect(findPreseededVehicle('HYUNDAI', 'ELANTRA', 2021)?.specs).toBeTruthy();
  });

  it('does not let a longer model name inherit a shorter record', () => {
    for (const [make, model] of [
      ['Toyota', 'Corolla Cross'],
      ['Toyota', 'Corolla Hybrid'],
      ['Hyundai', 'Tucson Hybrid'],
      ['Kia', 'Sportage GT-Line'],
      ['Nissan', 'Sunny N16'],
    ] as const) {
      expect(findPreseededVehicle(make, model, 2022), `${make} ${model}`).toBeNull();
    }
  });

  it('does not match everything when a name is blank', () => {
    expect(findPreseededVehicle('Toyota', '', 2020)).toBeNull();
    expect(findPreseededVehicle('', 'Corolla', 2020)).toBeNull();
    expect(findPreseededVehicle('   ', '   ', 2020)).toBeNull();
  });

  it('respects the catalogued year range on both ends', () => {
    const first = findPreseededVehicle('Toyota', 'Corolla', 2014);
    const last = findPreseededVehicle('Toyota', 'Corolla', 2026);
    expect(first?.specs).toBe(last?.specs);
    expect(findPreseededVehicle('Toyota', 'Corolla', 2013)).toBeNull();
    expect(findPreseededVehicle('Toyota', 'Corolla', 2027)).toBeNull();
  });

  it('falls back to a conservative heuristic for an unknown car', () => {
    expect(findPreseededVehicle('Toyota', 'Corolla Cross', 2022)).toBeNull();
    const specs = generateHeuristicSpecs('Toyota', 'Corolla Cross', 2022);
    expect(specs.engineOilViscosity).toBeTruthy();
    expect(specs.brakeFluidType).toBeTruthy();
  });
});
