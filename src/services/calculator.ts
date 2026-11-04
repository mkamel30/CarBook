import { FuelLog, MaintenanceSchedule } from '../domain/schemas';

export interface FuelConsumptionResult {
  distanceTraveledKm: number;
  litersUsed: number;
  litersPer100Km: number;
  kmPerLiter: number;
  costPerKm: number;
}

/**
 * Calculates fuel consumption across one full-tank-to-full-tank window.
 * `interveningLogs` are the partial top-ups made inside the window: the tank was
 * full at both ends, so everything burned in between went in across those visits too.
 * Fuel logs must be sorted chronologically ascending.
 */
export function calculateFuelConsumption(
  previousFullLog: FuelLog,
  currentLog: FuelLog,
  interveningLogs: FuelLog[] = []
): FuelConsumptionResult | null {
  if (currentLog.odometer <= previousFullLog.odometer) {
    return null;
  }

  const window = [...interveningLogs, currentLog];
  const distanceTraveledKm = currentLog.odometer - previousFullLog.odometer;
  const litersUsed = window.reduce((sum, log) => sum + log.liters, 0);
  const windowCost = window.reduce((sum, log) => sum + log.totalCost, 0);
  const litersPer100Km = Number(((litersUsed / distanceTraveledKm) * 100).toFixed(2));
  const kmPerLiter = Number((distanceTraveledKm / litersUsed).toFixed(2));
  const costPerKm = Number((windowCost / distanceTraveledKm).toFixed(2));

  return {
    distanceTraveledKm,
    litersUsed,
    litersPer100Km,
    kmPerLiter,
    costPerKm,
  };
}

export interface FuelMetrics {
  distanceTraveledKm: number | null;
  litersPer100Km: number | null;
  kmPerLiter: number | null;
  costPerKm: number | null;
}

const NO_METRICS: FuelMetrics = {
  distanceTraveledKm: null,
  litersPer100Km: null,
  kmPerLiter: null,
  costPerKm: null,
};

/**
 * Adds per-log consumption metrics, preserving the incoming array order.
 *
 * Only a full-tank fill closes a measurement window, so partial fills report nothing
 * of their own — their litres fold into the next full tank's window instead of being
 * discarded with the chain.
 */
export function enrichFuelMetrics<T extends FuelLog>(logs: T[]): (T & FuelMetrics)[] {
  const order = logs
    .map((log, index) => ({ log, index }))
    .sort((a, b) => {
      const dateCompare = a.log.fillDate.localeCompare(b.log.fillDate);
      return dateCompare !== 0 ? dateCompare : a.log.odometer - b.log.odometer;
    });

  const metrics = new Map<number, FuelMetrics>();
  for (let i = 0; i < order.length; i++) {
    const current = order[i].log;
    if (!current.isFullTank) continue;

    const intervening: FuelLog[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const previous = order[j].log;
      if (!previous.isFullTank) {
        intervening.unshift(previous);
        continue;
      }
      const stats = calculateFuelConsumption(previous, current, intervening);
      if (stats) {
        metrics.set(order[i].index, {
          distanceTraveledKm: stats.distanceTraveledKm,
          litersPer100Km: stats.litersPer100Km,
          kmPerLiter: stats.kmPerLiter,
          costPerKm: stats.costPerKm,
        });
      }
      break;
    }
  }

  return logs.map((log, index) => ({ ...log, ...(metrics.get(index) ?? NO_METRICS) }));
}

export type AlertSeverity = 'ok' | 'due_soon' | 'overdue' | 'needs_record';

export interface MaintenanceStatus {
  schedule: MaintenanceSchedule;
  /**
   * Kilometres until the next service, or null when no km math is possible:
   * either the item has no service record at all (`needs_record`) or its
   * baseline was recorded by date only. A missing baseline is NEVER read as 0 —
   * that would fabricate "serviced at odometer 0" and report a fake distance.
   */
  remainingKm: number | null;
  remainingDays: number | null;
  status: AlertSeverity;
  alertMessageAr: string;
  alertMessageEn: string;
}

const NEEDS_RECORD_AR = 'لا يوجد سجل صيانة لهذا البند بعد';
const NEEDS_RECORD_EN = 'No service record for this item yet';

/**
 * Evaluates periodic maintenance status based on current vehicle odometer and dates.
 * Alert thresholds:
 * - 'needs_record': neither a baseline odometer nor a baseline date exists, so
 *   nothing can be computed. Not overdue, not good — it asks for a service record.
 * - 'overdue': remainingKm <= 0 or remainingDays <= 0
 * - 'due_soon': remainingKm <= 1000 km or remainingDays <= 14 days
 * - 'ok': otherwise
 * An odometer baseline and a date baseline are independent: when only one is
 * recorded, only that axis drives the verdict and the other stays null.
 */
export function evaluateMaintenanceStatus(
  schedule: MaintenanceSchedule,
  currentOdometer: number,
  currentDate = new Date()
): MaintenanceStatus {
  const hasOdoBaseline =
    schedule.lastDoneOdometer !== null &&
    schedule.lastDoneOdometer !== undefined &&
    Number.isFinite(schedule.lastDoneOdometer);
  const hasDateBaseline = !!schedule.lastDoneDate;

  if (!hasOdoBaseline && !hasDateBaseline) {
    return {
      schedule,
      remainingKm: null,
      remainingDays: null,
      status: 'needs_record',
      alertMessageAr: NEEDS_RECORD_AR,
      alertMessageEn: NEEDS_RECORD_EN,
    };
  }

  const remainingKm = hasOdoBaseline
    ? Math.round(schedule.lastDoneOdometer! + schedule.intervalKm - currentOdometer)
    : null;

  let remainingDays: number | null = null;
  if (hasDateBaseline && schedule.intervalMonths) {
    const lastDate = new Date(schedule.lastDoneDate!);
    const dueDate = new Date(lastDate);
    dueDate.setMonth(dueDate.getMonth() + schedule.intervalMonths);
    const diffTime = dueDate.getTime() - currentDate.getTime();
    remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  const isOverdue =
    (remainingKm !== null && remainingKm <= 0) || (remainingDays !== null && remainingDays <= 0);
  const isDueSoon =
    !isOverdue &&
    ((remainingKm !== null && remainingKm <= 1000) || (remainingDays !== null && remainingDays <= 14));

  let status: AlertSeverity = 'ok';
  if (isOverdue) status = 'overdue';
  else if (isDueSoon) status = 'due_soon';

  let alertMessageAr = '';
  let alertMessageEn = '';

  if (status === 'overdue') {
    if (remainingKm !== null) {
      alertMessageAr = `تجاوز موعد الصيانة بـ ${Math.abs(remainingKm)} كم! يجب الفحص فورا`;
      alertMessageEn = `Service is overdue by ${Math.abs(remainingKm)} km! Immediate check recommended`;
    } else {
      alertMessageAr = 'تجاوز موعد الصيانة الزمني المسجل! يجب الفحص فورا';
      alertMessageEn = 'Service is overdue by the recorded date! Immediate check recommended';
    }
  } else if (status === 'due_soon') {
    if (remainingKm !== null) {
      alertMessageAr = `موعد الصيانة اقترب (متبقي ${remainingKm} كم)`;
      alertMessageEn = `Service due soon (${remainingKm} km remaining)`;
    } else {
      alertMessageAr = 'موعد الصيانة اقترب حسب التاريخ المسجل';
      alertMessageEn = 'Service due soon by the recorded date';
    }
  } else if (remainingKm !== null) {
    alertMessageAr = `الحالة جيدة (متبقي ${remainingKm} كم)`;
    alertMessageEn = `Status good (${remainingKm} km remaining)`;
  } else {
    alertMessageAr = 'الحالة جيدة حسب تاريخ آخر صيانة المسجل';
    alertMessageEn = 'Status good by the recorded service date';
  }

  return {
    schedule,
    remainingKm,
    remainingDays,
    status,
    alertMessageAr,
    alertMessageEn,
  };
}

// ---- Feature 1: predictive due date ---------------------------------------
//
// evaluateMaintenanceStatus tells you where a service sits NOW, but a km-based
// item with no date baseline has `remainingDays: null`, so nothing can tell the
// user (or the closed-app alarm scheduler) WHEN it will come due. This projects
// that date from the car's own recent driving rate — average km/day over the last
// `windowDays` (default 90) — and falls back to the intervalMonths date when there
// is no usable rate yet (a new car, a fresh install, or a parked vehicle).
//
// Pure and side-effect-free: it takes plain usage points (odometer + a parseable
// date), so the same code runs on the server, in the offline bridge and under Node.

const DAY_MS = 86_400_000;

export interface UsagePoint {
  odometer: number;
  /** Anything `new Date()` accepts: ISO string, epoch ms, or a Date. */
  date: string | number | Date;
}

export type DueBasis = 'usage' | 'interval_months' | 'none';

export interface ProjectedDue {
  /** When the km threshold is predicted to be hit (usage basis), or the intervalMonths date (fallback), or null. */
  dueDate: Date | null;
  /** Whole days from `now` to `dueDate` (negative/0 for already-due), or null when undatable. */
  daysToDue: number | null;
  /** Derived km/day, or null when the window had too little data to compute one. */
  avgKmPerDay: number | null;
  /** Kilometres left against the latest odometer reading, or null when there is no km baseline. */
  remainingKm: number | null;
  basis: DueBasis;
}

function toDayMs(d: string | number | Date): number | null {
  const ms = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Map raw fuel logs (the car's continuous odometer history) to usage points,
 * dropping any row without a finite odometer or a date. Shared so the web page and
 * the offline sweep feed projectDueDate identically.
 */
export function usageFromFuelLogs(
  logs: Array<{ odometer?: unknown; fillDate?: unknown } | null | undefined>,
): UsagePoint[] {
  const points: UsagePoint[] = [];
  for (const l of logs) {
    if (!l) continue;
    const odo = Number(l.odometer);
    const date = l.fillDate;
    if (Number.isFinite(odo) && typeof date === 'string' && date) {
      points.push({ odometer: odo, date });
    }
  }
  return points;
}

/**
 * Net distance per elapsed day across the recent window, measured from the first
 * to the last reading by DATE (not min/max odometer, which would ignore order).
 * Returns null unless there are at least two in-window points spanning real time
 * and forward motion; a parked car (no odometer spread) or a single reading is
 * deliberately "no rate", which triggers the intervalMonths fallback upstream.
 */
export function averageKmPerDay(usage: UsagePoint[], now: Date, windowDays: number): number | null {
  if (!Number.isFinite(windowDays) || windowDays <= 0) return null;
  const maxTime = now.getTime();
  const minTime = maxTime - windowDays * DAY_MS;

  const points = usage
    .map((p) => ({ odo: p.odometer, t: toDayMs(p.date) }))
    .filter((p): p is { odo: number; t: number } =>
      Number.isFinite(p.odo) && p.t !== null && p.t >= minTime && p.t <= maxTime);

  if (points.length < 2) return null;
  points.sort((a, b) => a.t - b.t);

  const first = points[0];
  const last = points[points.length - 1];
  const daySpan = (last.t - first.t) / DAY_MS;
  const kmSpan = last.odo - first.odo;
  if (daySpan <= 0 || kmSpan <= 0) return null;
  return kmSpan / daySpan;
}

/**
 * Project the next service date for one schedule. Usage rate is primary (per the
 * feature spec); intervalMonths is the fallback for a km item with no measurable
 * driving yet, and 'none' when even that is unavailable (needs a service record).
 */
export function projectDueDate(
  schedule: MaintenanceSchedule,
  usage: UsagePoint[],
  opts: { now?: Date; windowDays?: number } = {},
): ProjectedDue {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 90;

  const hasOdoBaseline =
    schedule.lastDoneOdometer !== null &&
    schedule.lastDoneOdometer !== undefined &&
    Number.isFinite(schedule.lastDoneOdometer);

  // Latest known odometer drives the km countdown (an odometer only moves forward).
  const currentOdo = usage.reduce<number | null>(
    (max, p) => (Number.isFinite(p.odometer) && (max === null || p.odometer > max) ? p.odometer : max),
    null,
  );
  const remainingKm = hasOdoBaseline && currentOdo !== null
    ? Math.round(schedule.lastDoneOdometer! + schedule.intervalKm - currentOdo)
    : null;

  const avgKmPerDay = averageKmPerDay(usage, now, windowDays);

  // Primary: project the km threshold forward using the measured daily rate.
  if (remainingKm !== null && avgKmPerDay !== null && avgKmPerDay > 0) {
    if (remainingKm <= 0) {
      return { dueDate: new Date(now.getTime()), daysToDue: 0, avgKmPerDay, remainingKm, basis: 'usage' };
    }
    const daysToDue = Math.ceil(remainingKm / avgKmPerDay);
    return {
      dueDate: new Date(now.getTime() + daysToDue * DAY_MS),
      daysToDue,
      avgKmPerDay,
      remainingKm,
      basis: 'usage',
    };
  }

  // Fallback: date-bounded items (or a km item with no measurable driving yet)
  // are scheduled by intervalMonths from the last service date, exactly as the
  // calendar axis of evaluateMaintenanceStatus already computes.
  if (schedule.lastDoneDate && schedule.intervalMonths && schedule.intervalMonths > 0) {
    const dueDate = new Date(schedule.lastDoneDate);
    dueDate.setMonth(dueDate.getMonth() + schedule.intervalMonths);
    const daysToDue = Math.ceil((dueDate.getTime() - now.getTime()) / DAY_MS);
    return { dueDate, daysToDue, avgKmPerDay, remainingKm, basis: 'interval_months' };
  }

  // Nothing to anchor on: no km target reachable by a rate, no date baseline.
  return { dueDate: null, daysToDue: null, avgKmPerDay, remainingKm, basis: 'none' };
}

/**
 * How many days ahead to place a due-soon reminder (null = no date, nudge soon).
 *
 * A date-based item already carries `remainingDays`. A km-only item does not, so
 * Feature 1 projects its due day from the measured driving rate. Overdue rows are
 * deliberately null — the caller aims those at an immediate hour. Kept here (pure,
 * no Capacitor) so the timing decision is unit-testable and shared by both surfaces.
 */
export function alarmDelayDays(s: any, usage: UsagePoint[], nowMs: number): number | null {
  if (!s || s.status !== 'due_soon') return null;
  if (Number.isFinite(s.remainingDays) && s.remainingDays > 0) return s.remainingDays;
  const projected = projectDueDate(s.schedule, usage, { now: new Date(nowMs) });
  if (projected.basis !== 'none' && Number.isFinite(projected.daysToDue ?? NaN) && (projected.daysToDue as number) > 0) {
    return projected.daysToDue;
  }
  return null;
}
