'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@/i18n/context';
import { readEnvelope } from '@/hooks/apiEnvelope';
import { pushToast } from '@/components/ui/Toast';
import { askConfirm } from '@/components/ui/ConfirmDialog';
import {
  newFuelLogPrefill,
  fuelTypeForEdit,
  fuelFormFromLog,
  fuelSavePayload,
  type FuelForm,
  type FuelTypeOption,
} from '@/hooks/formModel';

export interface UseFuelLogsOptions {
  selectedVehicle: any | null;
  fuelLogs: any[];
  fuelTypes: FuelTypeOption[] | undefined;
  reloadDetails: (vehicleId: string, force?: boolean) => void;
  reloadVehicles: () => Promise<void>;
}

/** The fuel-log domain (A5): modal open/close, prefill, and create/update/delete. */
export function useFuelLogs({ selectedVehicle, fuelLogs, fuelTypes, reloadDetails, reloadVehicles }: UseFuelLogsOptions) {
  const { t } = useTranslation();
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [editingFuelId, setEditingFuelId] = useState<string | null>(null);
  const [selectedFuelType, setSelectedFuelType] = useState<string>('');
  // Matches the pre-refactor initial state exactly; the modal always re-prefills
  // via openAddFuelModal before it is shown, but keep the literal for parity.
  const [fuelForm, setFuelForm] = useState<FuelForm>({
    fillDate: new Date().toISOString().split('T')[0],
    odometer: 0,
    liters: 40,
    pricePerLiter: 15,
    totalCost: 600,
    isFullTank: true,
    notes: '',
  });
  const [savingFuel, setSavingFuel] = useState(false);
  const [deletingFuelId, setDeletingFuelId] = useState<string | null>(null);

  const openAddFuelModal = useCallback(() => {
    setEditingFuelId(null);
    const { selectedFuelType: type, form } = newFuelLogPrefill({
      fuelLogs,
      fuelTypes,
      currentOdometer: selectedVehicle?.currentOdometer,
      today: new Date().toISOString().split('T')[0],
    });
    setSelectedFuelType(type);
    setFuelForm(form);
    setShowFuelModal(true);
  }, [fuelLogs, fuelTypes, selectedVehicle]);

  const openEditFuelModal = useCallback((log: any) => {
    setEditingFuelId(log.id);
    setSelectedFuelType(fuelTypeForEdit(log, fuelTypes));
    setFuelForm(fuelFormFromLog(log));
    setShowFuelModal(true);
  }, [fuelTypes]);

  const handleDeleteFuel = useCallback(async (id: string) => {
    if (deletingFuelId) return;
    const ok = await askConfirm({
      title: t('btn_delete'),
      message: t('confirm_delete_fuel'),
      danger: true,
      confirmLabel: t('btn_delete'),
    });
    if (!ok) return;

    setDeletingFuelId(id);
    try {
      const res = await fetch(`/api/fuel?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await readEnvelope(res);
      if (data.success) {
        if (selectedVehicle) {
          reloadDetails(selectedVehicle.id, true);
          reloadVehicles();
        }
      } else {
        pushToast(data.error, 'error');
      }
    } catch (e: any) {
      pushToast(e?.message || t('err_delete_fuel'), 'error');
    } finally {
      setDeletingFuelId(null);
    }
  }, [deletingFuelId, t, selectedVehicle, reloadDetails, reloadVehicles]);

  const handleSaveFuel = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || savingFuel) return;
    setSavingFuel(true);

    const url = '/api/fuel';
    const method = editingFuelId ? 'PUT' : 'POST';
    const payload = fuelSavePayload({
      form: fuelForm,
      editingId: editingFuelId,
      vehicleId: selectedVehicle.id,
    });

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readEnvelope(res);
      if (data.success) {
        setShowFuelModal(false);
        setEditingFuelId(null);
        reloadDetails(selectedVehicle.id, true);
        reloadVehicles();
      } else {
        pushToast(data.error, 'error');
      }
    } catch (err: any) {
      pushToast(err?.message || t('err_request_failed'), 'error');
    } finally {
      setSavingFuel(false);
    }
  }, [selectedVehicle, savingFuel, editingFuelId, fuelForm, t, reloadDetails, reloadVehicles]);

  return {
    showFuelModal,
    setShowFuelModal,
    editingFuelId,
    selectedFuelType,
    setSelectedFuelType,
    fuelForm,
    setFuelForm,
    savingFuel,
    openAddFuelModal,
    openEditFuelModal,
    handleDeleteFuel,
    handleSaveFuel,
  };
}
