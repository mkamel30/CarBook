'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@/i18n/context';
import { readEnvelope } from '@/hooks/apiEnvelope';
import { pushToast } from '@/components/ui/Toast';
import { askConfirm } from '@/components/ui/ConfirmDialog';
import {
  emptyMaintenanceForm,
  partsListFromLog,
  maintenanceFormFromLog,
  maintenanceSavePayload,
  type MaintenanceForm,
  type MaintenancePart,
} from '@/hooks/formModel';

export interface UseMaintenanceLogsOptions {
  selectedVehicle: any | null;
  reloadDetails: (vehicleId: string, force?: boolean) => void;
  reloadVehicles: () => Promise<void>;
}

/** The maintenance-log domain (A5): modal open/close, parts editor, CRUD. */
export function useMaintenanceLogs({ selectedVehicle, reloadDetails, reloadVehicles }: UseMaintenanceLogsOptions) {
  const { t } = useTranslation();
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [editingMaintenanceId, setEditingMaintenanceId] = useState<string | null>(null);
  const [partsList, setPartsList] = useState<MaintenancePart[]>([]);
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceForm>(() =>
    emptyMaintenanceForm({ today: new Date().toISOString().split('T')[0], odometer: 0 })
  );
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [deletingMaintenanceId, setDeletingMaintenanceId] = useState<string | null>(null);

  const openAddMaintenanceModal = useCallback(() => {
    setEditingMaintenanceId(null);
    setPartsList([]);
    setMaintenanceForm(emptyMaintenanceForm({
      today: new Date().toISOString().split('T')[0],
      odometer: selectedVehicle?.currentOdometer,
    }));
    setShowMaintenanceModal(true);
  }, [selectedVehicle]);

  const openEditMaintenanceModal = useCallback((log: any) => {
    setEditingMaintenanceId(log.id);
    setPartsList(partsListFromLog(log, Date.now()));
    setMaintenanceForm(maintenanceFormFromLog(log));
    setShowMaintenanceModal(true);
  }, []);

  const handleDeleteMaintenance = useCallback(async (id: string) => {
    if (deletingMaintenanceId) return;
    const ok = await askConfirm({
      title: t('btn_delete'),
      message: t('confirm_delete_maint'),
      danger: true,
      confirmLabel: t('btn_delete'),
    });
    if (!ok) return;

    setDeletingMaintenanceId(id);
    try {
      const res = await fetch(`/api/maintenance?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
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
      pushToast(e?.message || t('err_delete_maint'), 'error');
    } finally {
      setDeletingMaintenanceId(null);
    }
  }, [deletingMaintenanceId, t, selectedVehicle, reloadDetails, reloadVehicles]);

  const handleSaveMaintenance = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || savingMaintenance) return;
    setSavingMaintenance(true);

    const url = '/api/maintenance';
    const method = editingMaintenanceId ? 'PUT' : 'POST';
    const payload = maintenanceSavePayload({
      form: maintenanceForm,
      partsList,
      editingId: editingMaintenanceId,
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
        setShowMaintenanceModal(false);
        setEditingMaintenanceId(null);
        setPartsList([]);
        if (data.data?.linkedSchedules > 0) {
          pushToast(t('maint_linked_schedules', { count: data.data.linkedSchedules }), 'success');
        }
        reloadDetails(selectedVehicle.id, true);
        reloadVehicles();
      } else {
        pushToast(data.error, 'error');
      }
    } catch (err: any) {
      pushToast(err?.message || t('err_request_failed'), 'error');
    } finally {
      setSavingMaintenance(false);
    }
  }, [selectedVehicle, savingMaintenance, editingMaintenanceId, maintenanceForm, partsList, t, reloadDetails, reloadVehicles]);

  return {
    showMaintenanceModal,
    setShowMaintenanceModal,
    editingMaintenanceId,
    partsList,
    setPartsList,
    maintenanceForm,
    setMaintenanceForm,
    savingMaintenance,
    openAddMaintenanceModal,
    openEditMaintenanceModal,
    handleDeleteMaintenance,
    handleSaveMaintenance,
  };
}
