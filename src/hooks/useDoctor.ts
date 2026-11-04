'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/i18n/context';
import { readEnvelope } from '@/hooks/apiEnvelope';
import { pushToast } from '@/components/ui/Toast';

export interface UseDoctorOptions {
  selectedVehicle: any | null;
  lang: string;
}

/** The AI car-doctor domain (A5): query box, history, and the ask handler. */
export function useDoctor({ selectedVehicle, lang }: UseDoctorOptions) {
  const { t } = useTranslation();
  const [doctorQuery, setDoctorQuery] = useState('');
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [doctorHistory, setDoctorHistory] = useState<{ query: string; advice: string }[]>([]);

  // Keyed on the id alone, so a different car drops the previous one's
  // consultations while a save that only bumps the odometer does not.
  const vehicleId = selectedVehicle?.id;
  useEffect(() => {
    setDoctorHistory([]);
  }, [vehicleId]);

  const handleAskDoctor = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || !doctorQuery.trim()) return;
    const queryText = doctorQuery.trim();
    setDoctorLoading(true);
    try {
      const res = await fetch('/api/ai/doctor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: selectedVehicle.id, query: queryText, lang }),
      });
      const data = await readEnvelope(res);
      if (data.success) {
        setDoctorHistory((prev) => [
          { query: queryText, advice: data.data.advice },
          ...prev,
        ]);
        setDoctorQuery('');
      } else {
        pushToast(data.error, 'error');
      }
    } catch (e: any) {
      pushToast(e.message || t('err_request_failed'), 'error');
    } finally {
      setDoctorLoading(false);
    }
  }, [selectedVehicle, doctorQuery, lang, t]);

  return { doctorQuery, setDoctorQuery, doctorLoading, doctorHistory, handleAskDoctor };
}
