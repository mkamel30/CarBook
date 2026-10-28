import { FuelLog, MaintenanceSchedule } from '../domain/schemas';

export interface FuelConsumptionResult {
  distanceTraveledKm: number;
  litersUsed: number;
  litersPer100Km: number;
  kmPerLiter: number;
  costPerKm: number;
}

/**
 * Calculates fuel consumption between consecutive full-tank fill-ups.
 * Fuel logs must be sorted chronologically ascending.
 */
export function calculateFuelConsumption(previousFullLog: FuelLog, currentLog: FuelLog): FuelConsumptionResult | null {
  if (currentLog.odometer <= previousFullLog.odometer) {
    return null;
  }

  const distanceTraveledKm = currentLog.odometer - previousFullLog.odometer;
  const litersUsed = currentLog.liters;
  const litersPer100Km = Number(((litersUsed / distanceTraveledKm) * 100).toFixed(2));
  const kmPerLiter = Number((distanceTraveledKm / litersUsed).toFixed(2));
  const costPerKm = Number((currentLog.totalCost / distanceTraveledKm).toFixed(2));

  return {
    distanceTraveledKm,
    litersUsed,
    litersPer100Km,
    kmPerLiter,
    costPerKm,
  };
}

export type AlertSeverity = 'ok' | 'due_soon' | 'overdue';

export interface MaintenanceStatus {
  schedule: MaintenanceSchedule;
  remainingKm: number;
  remainingDays: number | null;
  status: AlertSeverity;
  alertMessageAr: string;
  alertMessageEn: string;
}

/**
 * Evaluates periodic maintenance status based on current vehicle odometer and dates.
 * Alert thresholds:
 * - 'overdue': remainingKm <= 0 or remainingDays <= 0
 * - 'due_soon': remainingKm <= 1000 km or remainingDays <= 14 days
 * - 'ok': otherwise
 */
export function evaluateMaintenanceStatus(
  schedule: MaintenanceSchedule,
  currentOdometer: number,
  currentDate = new Date()
): MaintenanceStatus {
  const lastOdo = schedule.lastDoneOdometer ?? 0;
  const nextDueOdo = lastOdo + schedule.intervalKm;
  const remainingKm = Math.round(nextDueOdo - currentOdometer);

  let remainingDays: number | null = null;
  if (schedule.lastDoneDate && schedule.intervalMonths) {
    const lastDate = new Date(schedule.lastDoneDate);
    const dueDate = new Date(lastDate);
    dueDate.setMonth(dueDate.getMonth() + schedule.intervalMonths);
    const diffTime = dueDate.getTime() - currentDate.getTime();
    remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  let status: AlertSeverity = 'ok';
  if (remainingKm <= 0 || (remainingDays !== null && remainingDays <= 0)) {
    status = 'overdue';
  } else if (remainingKm <= 1000 || (remainingDays !== null && remainingDays <= 14)) {
    status = 'due_soon';
  }

  let alertMessageAr = '';
  let alertMessageEn = '';

  if (status === 'overdue') {
    const kmOver = Math.abs(remainingKm);
    alertMessageAr = `تجاوز موعد الصيانة بـ ${kmOver} كم! يجب الفحص فورا`;
    alertMessageEn = `Service is overdue by ${kmOver} km! Immediate check recommended`;
  } else if (status === 'due_soon') {
    alertMessageAr = `موعد الصيانة اقترب (متبقي ${remainingKm} كم)`;
    alertMessageEn = `Service due soon (${remainingKm} km remaining)`;
  } else {
    alertMessageAr = `الحالة جيدة (متبقي ${remainingKm} كم)`;
    alertMessageEn = `Status good (${remainingKm} km remaining)`;
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
