import { describe, it, expect } from 'vitest';
import {
  calculateFuelConsumption,
  enrichFuelMetrics,
  evaluateMaintenanceStatus,
} from '@/services/calculator';
import type { FuelLog, MaintenanceSchedule } from '@/domain/schemas';

// T9 calculator edge coverage. Assertions describe the ACTUAL behavior of
// src/services/calculator.ts (equal/decreasing odometer windows return null at
// line 22; only full-tank fills close a window; date-only overdue wins over
// remaining km).

function log(
  id: string,
  fillDate: string,
  odometer: number,
  liters: number,
  isFullTank: boolean,
  pricePerLiter = 15,
): FuelLog {
  return {
    id,
    vehicleId: 'v1',
    fillDate,
    odometer,
    liters,
    pricePerLiter,
    totalCost: Number((liters * pricePerLiter).toFixed(2)),
    isFullTank,
  };
}

describe('calculateFuelConsumption — odometer edge cases', () => {
  it('returns null for an equal odometer across two full-tank fills (no distance, no division)', () => {
    const prev = log('a', '2026-01-01', 50000, 40, true);
    const cur = log('b', '2026-01-10', 50000, 35, true);
    // calculator.ts:22 — `currentLog.odometer <= previousFullLog.odometer` → null.
    expect(calculateFuelConsumption(prev, cur)).toBeNull();
  });

  it('returns null for a decreasing odometer (mis-entered reading never yields negative stats)', () => {
    const prev = log('a', '2026-01-01', 50500, 40, true);
    const cur = log('b', '2026-01-10', 50000, 35, true);
    expect(calculateFuelConsumption(prev, cur)).toBeNull();

    // One meter of travel still computes — the boundary is `<=`, not `<`.
    const ok = calculateFuelConsumption(prev, log('c', '2026-01-10', 50501, 1, true));
    expect(ok).not.toBeNull();
    expect(ok!.distanceTraveledKm).toBe(1);
  });

  it('a zero-liter window chain is computable at this layer (validation lives in the domain schema): 0 L/100km and infinite km/L', () => {
    // enrich/calculate do not re-validate FuelLog; this pins what actually
    // happens if a zero-liter row reaches them (e.g. crafted object, not UI).
    const prev = log('a', '2026-01-01', 50000, 0, true);
    const cur = log('b', '2026-01-10', 50500, 0, true);
    const stats = calculateFuelConsumption(prev as any, cur as any);
    expect(stats).not.toBeNull();
    expect(stats!.litersPer100Km).toBe(0);
    expect(stats!.kmPerLiter).toBe(Infinity); // distance / 0 liters
    expect(stats!.costPerKm).toBe(0);
  });
});

describe('enrichFuelMetrics — chain edge cases', () => {
  it('a lone first fill (full tank) reports no metrics — there is no previous window', () => {
    const enriched = enrichFuelMetrics([log('only', '2026-01-01', 50000, 40, true)]);
    expect(enriched[0].litersPer100Km).toBeNull();
    expect(enriched[0].distanceTraveledKm).toBeNull();
    expect(enriched[0].kmPerLiter).toBeNull();
    expect(enriched[0].costPerKm).toBeNull();
  });

  it('a chain of partial fills with no closing full tank yields no metrics at all', () => {
    const enriched = enrichFuelMetrics([
      log('p1', '2026-01-01', 50000, 10, false),
      log('p2', '2026-01-05', 50200, 8, false),
      log('p3', '2026-01-08', 50400, 12, false),
    ]);
    for (const e of enriched) {
      expect(e.litersPer100Km).toBeNull();
      expect(e.distanceTraveledKm).toBeNull();
    }
  });

  it('an equal-odometer full tank after a full tank closes nothing, and the NEXT full tank chains from the last accepted anchor', () => {
    const enriched = enrichFuelMetrics([
      log('a', '2026-01-01', 50000, 40, true),
      log('dup', '2026-01-05', 50000, 5, true),   // same odometer → window a→dup null
      log('c', '2026-01-10', 50500, 35, true),    // window dup→c: 35 L over 500 km
    ]);
    expect(enriched[0].litersPer100Km).toBeNull();
    expect(enriched[1].litersPer100Km).toBeNull();
    // The dup fill is itself an anchor: its window against 'a' is refused, but
    // 'c' chains from 'dup' (50000), not from 'a' silently differently — same
    // odometer, so the numbers coincide; the liters used is 'c' alone.
    expect(enriched[2].distanceTraveledKm).toBe(500);
    expect(enriched[2].litersPer100Km).toBe(7.0);
  });

  it('multiple consecutive partials all fold into the next full tank window (chaining correctness)', () => {
    // 50000 full(40L) → +5L → +10L → 50500 full(30L)
    // Window liters = 5 + 10 + 30 = 45 over 500 km → 9.0 L/100km, 11.11 km/L.
    const enriched = enrichFuelMetrics([
      log('a', '2026-01-01', 50000, 40, true),
      log('b', '2026-01-03', 50100, 5, false, 12),
      log('c', '2026-01-06', 50250, 10, false, 13),
      log('d', '2026-01-10', 50500, 30, true, 15),
    ]);
    expect(enriched[0].litersPer100Km).toBeNull();  // first full: no window
    expect(enriched[1].litersPer100Km).toBeNull();  // partials report nothing alone
    expect(enriched[2].litersPer100Km).toBeNull();
    expect(enriched[3].distanceTraveledKm).toBe(500);
    expect(enriched[3].litersPer100Km).toBe(9.0);
    expect(enriched[3].kmPerLiter).toBe(11.11);
    // costPerKm covers the whole window: (5*12 + 10*13 + 30*15) / 500 = 640/500
    expect(enriched[3].costPerKm).toBe(1.28);

    // Trailing partials after the last full tank belong to an unclosed window.
    const withTrailing = enrichFuelMetrics([
      log('a', '2026-01-01', 50000, 40, true),
      log('d', '2026-01-10', 50500, 30, true),
      log('t', '2026-01-15', 50600, 6, false),
    ]);
    expect(withTrailing[2].litersPer100Km).toBeNull();
  });

  it('preserves input order even when rows arrive out of chronological order', () => {
    const enriched = enrichFuelMetrics([
      log('newer', '2026-01-10', 50500, 35, true),
      log('older', '2026-01-01', 50000, 40, true),
    ]);
    expect(enriched.map((e) => e.id)).toEqual(['newer', 'older']);
    // Chronological window older→newer is measured on 'newer' (index 0).
    expect(enriched[0].litersPer100Km).toBe(7.0);
    expect(enriched[1].litersPer100Km).toBeNull();
  });
});

describe('evaluateMaintenanceStatus — date-only edges', () => {
  const base: MaintenanceSchedule = {
    id: 's1',
    vehicleId: 'v1',
    itemCode: 'oil',
    titleAr: 'تغيير الزيت',
    titleEn: 'Oil Change',
    intervalKm: 10000,
    intervalMonths: 6,
    lastDoneOdometer: 50000,
    lastDoneDate: '2026-01-01',
  };

  it('a past-due DATE forces overdue even while km remain', () => {
    // Due 2026-07-01; checked 2026-08-01 → remainingDays <= 0 but 8000 km left.
    const s = evaluateMaintenanceStatus(base, 52000, new Date('2026-08-01'));
    expect(s.remainingKm).toBe(8000);
    expect(s.remainingDays).not.toBeNull();
    expect(s.remainingDays! <= 0).toBe(true);
    expect(s.status).toBe('overdue');
  });

  it('a near-due date (<= 14 days) flags due_soon even with plenty of km', () => {
    // Due 2026-07-01; checked 2026-06-20 → ~11 days left, 8000 km left.
    const s = evaluateMaintenanceStatus(base, 52000, new Date('2026-06-20'));
    expect(s.remainingKm).toBe(8000);
    expect(s.remainingDays!).toBeGreaterThan(0);
    expect(s.remainingDays!).toBeLessThanOrEqual(14);
    expect(s.status).toBe('due_soon');
  });

  it('exactly at the km boundary (remainingKm = 0) is overdue, and 1000 km out is due_soon', () => {
    const atBoundary = evaluateMaintenanceStatus(base, 60000, new Date('2026-02-01'));
    expect(atBoundary.remainingKm).toBe(0);
    expect(atBoundary.status).toBe('overdue');

    const soon = evaluateMaintenanceStatus(base, 59000, new Date('2026-02-01'));
    expect(soon.remainingKm).toBe(1000);
    expect(soon.status).toBe('due_soon');
  });

  it('no date / no month interval → remainingDays stays null and km drive the verdict', () => {
    const noDates: MaintenanceSchedule = { ...base, lastDoneDate: null, intervalMonths: null };
    const s = evaluateMaintenanceStatus(noDates, 52000, new Date('2030-01-01'));
    expect(s.remainingDays).toBeNull();
    expect(s.status).toBe('ok');
  });

  it('null lastDoneOdometer is treated as a zero baseline (never NaN)', () => {
    const s = evaluateMaintenanceStatus({ ...base, lastDoneOdometer: null }, 5000, new Date('2026-02-01'));
    expect(s.remainingKm).toBe(5000);
    expect(Number.isFinite(s.remainingKm)).toBe(true);
    expect(s.status).toBe('ok');
  });
});
