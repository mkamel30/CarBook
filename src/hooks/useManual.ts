'use client';

import { useState, useCallback } from 'react';
import { readEnvelope } from '@/hooks/apiEnvelope';

export interface UseManualOptions {
  selectedVehicle: any | null;
  setSelectedVehicle: React.Dispatch<React.SetStateAction<any | null>>;
  reloadVehicles: () => Promise<void>;
}

/** The OEM manual-specs domain (A5): fetch via AI and patch the selection. */
export function useManual({ selectedVehicle, setSelectedVehicle, reloadVehicles }: UseManualOptions) {
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const handleFetchManual = useCallback(async () => {
    if (!selectedVehicle) return;
    setManualLoading(true);
    setManualError(null);
    try {
      const res = await fetch('/api/ai/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: selectedVehicle.id }),
      });
      const data = await readEnvelope(res);
      if (data.success) {
        setSelectedVehicle({ ...selectedVehicle, specs: data.data });
        reloadVehicles();
      } else {
        setManualError(data.error);
      }
    } catch (e: any) {
      setManualError(e.message);
    } finally {
      setManualLoading(false);
    }
  }, [selectedVehicle, setSelectedVehicle, reloadVehicles]);

  return { manualLoading, manualError, handleFetchManual };
}
