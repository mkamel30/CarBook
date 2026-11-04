import { describe, it, expect } from 'vitest';
import {
  projectDueDate,
  averageKmPerDay,
  type UsagePoint,
} from '@/services/calculator';
import type { MaintenanceSchedule } from '@/domain/schemas';

const DAY = 86_400_000;
const NOW = new Date('2026-11-03T12:00:00.000Z');

// A plain schedule; only the fields the projection reads are meaningful here.
function sched(over: Partial<MaintenanceSchedule> = {}): MaintenanceSchedule {
  return {
    vehicleId: 'v1',
    itemCode: 'oil',
    titleAr: 'زيت',
    titleEn: 'Oil',
    intervalKm: 10000,
    intervalMonths: 6,
    lastDoneOdometer: 40000,
    lastDoneDate: '2026-08-01',
    ...over,
  } as MaintenanceSchedule;
}

// Steady driving at `kmPerDay` for the last `days`, ending at `endOdo`.
function steady(kmPerDay: number, days: number, endOdo: number): UsagePoint[] {
  const pts: UsagePoint[] = [];
  for (let d = 0; d <= days; d++) {
    pts.push({ odometer: endOdo - kmPerDay * (days - d), date: new Date(NOW.getTime() - (days - d) * DAY) });
  }
  return pts;
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY);
}

describe('averageKmPerDay (Feature 1 rate)', () => {
  it('measures net distance over elapsed days from first to last in-window reading', () => {
    // 500 km driven over 10 days -> 50 km/day.
    expect(averageKmPerDay(steady(50, 10, 10000), NOW, 90)).toBeCloseTo(50, 5);
  });

  it('returns null with fewer than two readings', () => {
    expect(averageKmPerDay([{ odometer: 5000, date: new Date(NOW) }], NOW, 90)).toBeNull();
    expect(averageKmPerDay([], NOW, 90)).toBeNull();
  });

  it('ignores readings older than the window (a stale trip cannot set the rate)', () => {
    const old = { odometer: 1000, date: new Date(NOW.getTime() - 200 * DAY) };
    const recent = { odometer: 1100, date: new Date(NOW.getTime() - 10 * DAY) };
    // Only `recent` is inside 90 days -> single point -> null.
    expect(averageKmPerDay([old, recent], NOW, 90)).toBeNull();
    // Widen the window and both count: 100 km over 190 days.
    expect(averageKmPerDay([old, recent], NOW, 210)).toBeCloseTo(100 / 190, 5);
  });

  it('treats a parked vehicle (no odometer spread) as no rate', () => {
    const flat = [
      { odometer: 5000, date: new Date(NOW.getTime() - 5 * DAY) },
      { odometer: 5000, date: new Date(NOW.getTime() - 1 * DAY) },
    ];
    expect(averageKmPerDay(flat, NOW, 90)).toBeNull();
  });

  it('guards against a backwards odometer (data error), never a negative rate', () => {
    const back = [
      { odometer: 5000, date: new Date(NOW.getTime() - 5 * DAY) },
      { odometer: 4000, date: new Date(NOW) },
    ];
    expect(averageKmPerDay(back, NOW, 90)).toBeNull();
  });

  it('ignores unparseable dates and non-finite odometers', () => {
    const pts = [
      { odometer: 1000, date: 'not-a-date' },
      { odometer: Number.NaN, date: new Date(NOW) },
      { odometer: 2000, date: new Date(NOW.getTime() - 20 * DAY) },
    ];
    expect(averageKmPerDay(pts, NOW, 90)).toBeNull();
  });
});

describe('projectDueDate (Feature 1)', () => {
  it('projects a km-only schedule from the measured daily rate', () => {
    // lastDone 40000 + interval 10000 = due at 50000. Newest reading 48000 -> 2000 km left.
    // 40 km/day -> 50 days out.
    const s = sched({ lastDoneDate: null });
    const r = projectDueDate(s, steady(40, 15, 48000), { now: NOW });
    expect(r.basis).toBe('usage');
    expect(r.remainingKm).toBe(2000);
    expect(r.daysToDue).toBe(50);
    expect(dayDiff(r.dueDate!, NOW)).toBe(50);
  });

  it('prefers usage over the intervalMonths date when a rate exists', () => {
    // intervalMonths=6 would be ~2027-02, but driving hard makes the km due sooner.
    const s = sched({ intervalMonths: 6 });
    const r = projectDueDate(s, steady(200, 20, 49000), { now: NOW });
    expect(r.basis).toBe('usage');
    expect(r.remainingKm).toBe(1000); // 10000 - (49000-40000)
    expect(r.daysToDue).toBe(5); // 1000 / 200
  });

  it('falls back to intervalMonths when there is no measurable driving yet', () => {
    const s = sched({ lastDoneDate: '2026-08-01', intervalMonths: 6 });
    const r = projectDueDate(s, [], { now: NOW }); // no usage at all
    expect(r.basis).toBe('interval_months');
    expect(r.dueDate!.toISOString().slice(0, 10)).toBe('2027-02-01');
    expect(r.avgKmPerDay).toBeNull();
  });

  it('already-due on km reports days 0 and today (usage basis)', () => {
    const s = sched({ lastDoneDate: null });
    const r = projectDueDate(s, steady(50, 10, 52000), { now: NOW }); // 52000 > 50000 due
    expect(r.basis).toBe('usage');
    expect(r.remainingKm).toBeLessThanOrEqual(0);
    expect(r.daysToDue).toBe(0);
    expect(r.dueDate!.getTime()).toBe(NOW.getTime());
  });

  it('needs_record (no baselines) projects nothing', () => {
    const s = sched({ lastDoneOdometer: null, lastDoneDate: null, intervalMonths: null });
    const r = projectDueDate(s, steady(30, 10, 1000), { now: NOW });
    expect(r.basis).toBe('none');
    expect(r.dueDate).toBeNull();
    expect(r.daysToDue).toBeNull();
    expect(r.remainingKm).toBeNull();
  });

  it('rounds a fractional projection up to whole days (never early)', () => {
    // 1499 km left at 100 km/day = 14.99 -> ceil 15, so the alarm is never premature.
    const s = sched({ lastDoneOdometer: 40000, intervalKm: 10000, lastDoneDate: null });
    const r = projectDueDate(s, steady(100, 10, 48501), { now: NOW });
    expect(r.remainingKm).toBe(1499); // 50000 - 48501
    expect(r.daysToDue).toBe(Math.ceil(1499 / 100));
  });

  it('a km baseline with no rate and no date baseline cannot be dated (none)', () => {
    const s = sched({ lastDoneDate: null, intervalMonths: null });
    // One reading: a current odometer (so the km figure is known) but no rate.
    const r = projectDueDate(s, [{ odometer: 45000, date: NOW }], { now: NOW });
    expect(r.basis).toBe('none');
    expect(r.dueDate).toBeNull();
    expect(r.daysToDue).toBeNull();
    expect(r.remainingKm).toBe(5000); // 50000 - 45000, still computed even if undatable
  });

  it('does not read a missing odometer baseline as zero', () => {
    // lastDoneOdometer null but date baseline present -> interval_months fallback,
    // and remainingKm stays null rather than fabricating distance from 0.
    const s = sched({ lastDoneOdometer: null, lastDoneDate: '2026-09-01', intervalMonths: 3 });
    const r = projectDueDate(s, steady(60, 10, 30000), { now: NOW });
    expect(r.basis).toBe('interval_months');
    expect(r.remainingKm).toBeNull();
  });
});
