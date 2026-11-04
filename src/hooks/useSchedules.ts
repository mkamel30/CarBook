'use client';

import { useCallback } from 'react';

export interface UseSchedulesOptions {
  schedules: any[];
  vehicleId: string | undefined;
  reloadDetails: (vehicleId: string, force?: boolean) => void;
}

/**
 * The preventive-maintenance domain (A5). The schedules ROWS and the notification
 * side effect are produced by the details fan-out (see useDetails), because the
 * notification must see the fuel history from the same batch; this hook is the
 * named seam for anything that only needs the schedules slice + a manual refresh.
 */
export function useSchedules({ schedules, vehicleId, reloadDetails }: UseSchedulesOptions) {
  const refresh = useCallback(() => {
    if (vehicleId) reloadDetails(vehicleId, true);
  }, [vehicleId, reloadDetails]);

  return { schedules, refresh };
}
