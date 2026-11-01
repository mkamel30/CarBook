import { describe, it, expect } from 'vitest';
import { deriveMaintenanceTotal } from '@/components/tabs/maintenanceTotals';

describe('deriveMaintenanceTotal', () => {
  it('recomputes the additive sum when parts and/or labor are filled', () => {
    expect(deriveMaintenanceTotal(300, 200, 999)).toEqual({ total: 500, derived: true });
    expect(deriveMaintenanceTotal(300, 0, 999)).toEqual({ total: 300, derived: true });
    expect(deriveMaintenanceTotal(0, 150, 999)).toEqual({ total: 150, derived: true });
  });

  it('honors the typed lump-sum total when parts and labor are both empty/zero', () => {
    expect(deriveMaintenanceTotal(0, 0, 750)).toEqual({ total: 750, derived: false });
    expect(deriveMaintenanceTotal('', '', '750.5')).toEqual({ total: 750.5, derived: false });
  });

  it('treats blank inputs as zero and never returns NaN', () => {
    expect(deriveMaintenanceTotal('', '', '')).toEqual({ total: 0, derived: false });
    expect(deriveMaintenanceTotal('abc', '2x', 10)).toEqual({ total: 10, derived: false });
    expect(deriveMaintenanceTotal('350.75', '49.25', '')).toEqual({ total: 400, derived: true });
  });

  it('coerces numeric strings for parts/labor so the UI stays truthful', () => {
    expect(deriveMaintenanceTotal('1200', '300', '0')).toEqual({ total: 1500, derived: true });
  });
});
