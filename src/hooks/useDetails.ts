'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { readEnvelope } from '@/hooks/apiEnvelope';
import { createRequestCache } from '@/hooks/requestCache';
import {
  planDetailsEffects,
  hasNoSpecs,
  type DetailsBatch,
} from '@/hooks/detailsModel';
import { evaluateAndNotifySchedules } from '@/services/notifications';

export interface UseDetailsOptions {
  selectedVehicle: any | null;
  lang: string;
  setSelectedVehicle: React.Dispatch<React.SetStateAction<any | null>>;
}

/**
 * The per-vehicle details fan-out (A5). The four reads (`/api/fuel`,
 * `/api/maintenance`, `/api/schedules`, `/api/reports`) stay atomic on purpose:
 * `/api/schedules` is notified with the fuel history from THE SAME batch, so the
 * notification side effect must never run against a previous vehicle's logs.
 *
 * The cache is dedupe-only (`ttlMs: 0`): concurrent identical reads share one
 * promise (a save refreshes details twice in a row — the explicit refresh and the
 * selected-vehicle effect the refreshed list triggers), but a completed read is
 * never replayed, so freshness is never traded away. Post-write callers pass
 * `force` to skip joining an in-flight request that may predate the write.
 */
export function useDetails({ selectedVehicle, lang, setSelectedVehicle }: UseDetailsOptions) {
  const [fuelLogs, setFuelLogs] = useState<any[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any | null>(null);

  // Only the newest request may write: switching A -> B must not let a slow
  // reply for A land after B's and paint A's logs under B's header.
  const detailsSeq = useRef(0);
  const cache = useMemo(() => createRequestCache<DetailsBatch>({ ttlMs: 0 }), []);

  // Latest-render refs so loadVehicleDetails keeps a stable identity (memoized
  // tabs receive it) without re-running the details effect on every render.
  const selectedRef = useRef(selectedVehicle);
  selectedRef.current = selectedVehicle;
  const langRef = useRef(lang);
  langRef.current = lang;

  const loadVehicleDetails = useCallback(async (vehicleId: string, force = false) => {
    const my = ++detailsSeq.current;
    const stale = () => my !== detailsSeq.current;

    try {
      const batch = await cache.load(`details:${vehicleId}`, async () => {
        const [fuelRes, maintRes, schedRes, repRes] = await Promise.all([
          fetch(`/api/fuel?vehicleId=${vehicleId}`).then(readEnvelope),
          fetch(`/api/maintenance?vehicleId=${vehicleId}`).then(readEnvelope),
          fetch(`/api/schedules?vehicleId=${vehicleId}`).then(readEnvelope),
          fetch(`/api/reports?vehicleId=${vehicleId}`).then(readEnvelope),
        ]);
        return {
          vehicleId,
          fuelOk: fuelRes.success,
          fuelLogs: fuelRes.success ? fuelRes.data : [],
          maintenanceOk: maintRes.success,
          maintenanceLogs: maintRes.success ? maintRes.data : [],
          schedulesOk: schedRes.success,
          schedules: schedRes.success ? schedRes.data.schedules : [],
          schedulesVehicleName: schedRes.success ? schedRes.data.vehicle?.name || '' : '',
          schedulesVehicleOdometer: schedRes.success ? schedRes.data.vehicle?.currentOdometer ?? null : null,
          reportOk: repRes.success,
          reportData: repRes.success ? repRes.data : null,
        } satisfies DetailsBatch;
      }, force);

      if (stale()) return;

      const plan = planDetailsEffects(batch, {
        vehicleNameFallback: selectedRef.current?.name || '',
        lang: langRef.current,
        selectedVehicleHasNoSpecs: hasNoSpecs(selectedRef.current),
      });

      if (plan.fuelLogs !== null) setFuelLogs(plan.fuelLogs);
      if (plan.maintenanceLogs !== null) setMaintenanceLogs(plan.maintenanceLogs);
      if (plan.schedules !== null) setSchedules(plan.schedules);
      if (plan.reportData !== null) setReportData(plan.reportData);

      if (plan.notify) {
        evaluateAndNotifySchedules(
          plan.notify.schedules,
          plan.notify.vehicleName,
          plan.notify.lang,
          plan.notify.usage,
          plan.notify.currentOdometer
        );
      }

      if (plan.specs) {
        setSelectedVehicle((prev: any) => {
          if (prev && (!prev.specs || (typeof prev.specs === 'object' && Object.keys(prev.specs).length === 0))) {
            return { ...prev, specs: plan.specs };
          }
          return prev;
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, [cache, setSelectedVehicle]);

  useEffect(() => {
    if (selectedVehicle) {
      loadVehicleDetails(selectedVehicle.id);
    }
  }, [selectedVehicle, loadVehicleDetails]);

  const clearAll = useCallback(() => {
    setFuelLogs([]);
    setMaintenanceLogs([]);
    setSchedules([]);
    setReportData(null);
  }, []);

  return { fuelLogs, maintenanceLogs, schedules, reportData, loadVehicleDetails, clearAll };
}
