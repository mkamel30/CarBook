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
