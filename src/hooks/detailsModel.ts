import { usageFromFuelLogs, type UsagePoint } from '@/services/calculator';

/**
 * Pure model for the per-vehicle details fan-out (`/api/fuel`, `/api/maintenance`,
 * `/api/schedules`, `/api/reports`).
 *
 * The four reads stay atomic on purpose: `/api/schedules` is notified through
 * `evaluateAndNotifySchedules` with the fuel history from THE SAME batch (a km-only
 * item's closed-app alarm is projected from those odometer points), so the schedules
 * side effect must never run against a previous vehicle's fuel logs. Splitting the
 * fetches into four independent hooks would make that ordering observable, which is
 * why one loader owns the batch and the per-domain hooks sit on top of its slices.
 */

export interface DetailsBatch {
  vehicleId: string;
  fuelOk: boolean;
  fuelLogs: any[];
  maintenanceOk: boolean;
  maintenanceLogs: any[];
  schedulesOk: boolean;
  schedules: any[];
  schedulesVehicleName: string;
  reportOk: boolean;
  reportData: any;
}

export interface NotifyArgs {
  schedules: any[];
  vehicleName: string;
  lang: string;
  usage: UsagePoint[];
}

export interface DetailsEffectPlan {
  /** Array state writes: only slices whose envelope succeeded are written. */
  fuelLogs: any[] | null;
  maintenanceLogs: any[] | null;
  schedules: any[] | null;
  reportData: any | null;
  /** `null` = do not notify / do not patch specs. */
  notify: NotifyArgs | null;
  specs: any | null;
}

/**
 * `emptySpecs` is the caller's verdict on the currently selected vehicle, kept as
 * an input so the planner stays pure (the page passes
 * `hasNoSpecs(selectedVehicle)` from the render-time value, exactly as before).
 */
export function planDetailsEffects(
  batch: DetailsBatch,
  opts: { vehicleNameFallback: string; lang: string; selectedVehicleHasNoSpecs: boolean }
): DetailsEffectPlan {
  const specsWanted = batch.reportOk && batch.reportData?.vehicle?.specs ? batch.reportData.vehicle.specs : null;

  return {
    fuelLogs: batch.fuelOk ? batch.fuelLogs : null,
    maintenanceLogs: batch.maintenanceOk ? batch.maintenanceLogs : null,
    schedules: batch.schedulesOk ? batch.schedules : null,
    reportData: batch.reportOk ? batch.reportData : null,
    notify: batch.schedulesOk
      ? {
          schedules: batch.schedules,
          vehicleName: batch.schedulesVehicleName || opts.vehicleNameFallback || '',
          lang: opts.lang,
          usage: usageFromFuelLogs(batch.fuelOk ? batch.fuelLogs : []),
        }
      : null,
    // Only fill in specs when the selection genuinely lacks them, so a save that
    // re-reads the batch never clobbers freshly edited specs.
    specs: specsWanted && opts.selectedVehicleHasNoSpecs ? specsWanted : null,
  };
}

/** The original guard: missing, or an object with no keys at all. */
export function hasNoSpecs(vehicle: any | null): boolean {
  if (!vehicle) return false;
  return !vehicle.specs || (typeof vehicle.specs === 'object' && Object.keys(vehicle.specs).length === 0);
}

/** True when the batch is a complete success — only then may it be cached. */
export function isCompleteBatch(batch: DetailsBatch): boolean {
  return batch.fuelOk && batch.maintenanceOk && batch.schedulesOk && batch.reportOk;
}
