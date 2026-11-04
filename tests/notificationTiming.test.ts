import { describe, it, expect } from 'vitest';
import { alarmDelayDays, type UsagePoint } from '@/services/calculator';

const DAY = 86_400_000;
const NOW = new Date('2026-11-03T12:00:00.000Z');
const NOWMS = NOW.getTime();

function sched(over: Record<string, unknown> = {}) {
  return {
    id: 's1', vehicleId: 'v1', titleAr: 'زيت', titleEn: 'Oil',
    intervalKm: 10000, intervalMonths: 6, lastDoneOdometer: 40000, lastDoneDate: '2026-08-01',
    ...over,
  };
}

function steady(kmPerDay: number, days: number, endOdo: number): UsagePoint[] {
  const pts: UsagePoint[] = [];
  for (let d = 0; d <= days; d++) {
    pts.push({ odometer: endOdo - kmPerDay * (days - d), date: new Date(NOWMS - (days - d) * DAY) });
  }
  return pts;
}

describe('alarmDelayDays (Feature 1 wiring decision)', () => {
  it('is null for overdue (the caller nudges those immediately)', () => {
    expect(alarmDelayDays({ status: 'overdue', schedule: sched(), remainingDays: null }, [], NOWMS)).toBeNull();
  });

  it('is null for anything not due_soon', () => {
    expect(alarmDelayDays({ status: 'ok', schedule: sched() }, steady(40, 10, 48000), NOWMS)).toBeNull();
  });

  it('keeps the recorded date axis when one exists', () => {
    expect(alarmDelayDays({ status: 'due_soon', schedule: sched(), remainingDays: 3 }, steady(40, 10, 48000), NOWMS)).toBe(3);
  });

  it('projects a km-only due-soon item from the measured driving rate', () => {
    // No remainingDays (km-only); 2000 km left at 40/day -> 50 days.
    const row = { status: 'due_soon', schedule: sched({ lastDoneDate: null }), remainingDays: null };
    expect(alarmDelayDays(row, steady(40, 15, 48000), NOWMS)).toBe(50);
  });

  it('falls back to the intervalMonths day when a km-only item has no driving history', () => {
    // lastDoneDate present + intervalMonths -> a real date, so a positive day still lands.
    const row = { status: 'due_soon', schedule: sched({ lastDoneOdometer: null }), remainingDays: null };
    const days = alarmDelayDays(row, [], NOWMS);
    expect(typeof days).toBe('number');
    expect(days).not.toBeNull();
    expect(days!).toBeGreaterThan(0);
  });

  it('is null when nothing can anchor the date (no rate, no date baseline)', () => {
    const row = { status: 'due_soon', schedule: sched({ lastDoneDate: null, intervalMonths: null }), remainingDays: null };
    // A single odometer reading gives a km figure but no rate -> undatable -> null.
    expect(alarmDelayDays(row, [{ odometer: 45000, date: NOWMS }], NOWMS)).toBeNull();
  });
});
