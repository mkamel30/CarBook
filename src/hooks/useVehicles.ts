'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@/i18n/context';
import { readEnvelope } from '@/hooks/apiEnvelope';
import { pushToast } from '@/components/ui/Toast';
import { askConfirm } from '@/components/ui/ConfirmDialog';
import {
  emptyVehicleForm,
  vehicleFormFromVehicle,
  vehicleSaveBody,
  type VehicleForm,
} from '@/hooks/formModel';
import { resolveNextVehicle } from '@/hooks/workbenchModel';

/**
 * The vehicles domain (A5): list, selection, and the add/edit/delete/AI-lookup
 * flows. `loadVehicles` keeps the SAME selected-vehicle object when a refresh
 * returns an unchanged odometer, so the details fan-out never loads twice.
 */
export function useVehicles() {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  // Initial-load truthfulness: a failed first fetch must show an error panel
  // with Retry, never the first-run "add your car" state (it invites duplicate vehicles).
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);

  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState<VehicleForm>(() => emptyVehicleForm(new Date().getFullYear()));
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [deletingVehicleId, setDeletingVehicleId] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiProposal, setAiProposal] = useState<any | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadVehicles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/vehicles');
      const data = await readEnvelope(res);
      if (data.success) {
        setInitialLoadError(null);
        setVehicles(data.data);
        if (data.data.length > 0) {
          setSelectedVehicle((prev: any) => resolveNextVehicle(prev, data.data));
        } else {
          setSelectedVehicle(null);
        }
      } else {
        setInitialLoadError(data.error || 'Failed to load vehicles');
      }
    } catch (e) {
      console.error('Failed to load vehicles', e);
      setInitialLoadError(e instanceof Error ? e.message : 'Failed to load vehicles');
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, []);

  const openAddVehicleModal = useCallback(() => {
    setEditingVehicleId(null);
    setVehicleForm(emptyVehicleForm(new Date().getFullYear()));
    setAiProposal(null);
    setAiError(null);
    setShowAddVehicleModal(true);
  }, []);

  const openEditVehicleModal = useCallback((v: any) => {
    if (!v) return;
    setEditingVehicleId(v.id);
    setVehicleForm(vehicleFormFromVehicle(v));
    setAiProposal(null);
    setAiError(null);
    setShowAddVehicleModal(true);
  }, []);

  const handleDeleteVehicle = useCallback(async (v: any) => {
    if (!v || deletingVehicleId) return;
    const ok = await askConfirm({
      title: t('btn_delete_vehicle'),
      message: t('confirm_delete_vehicle'),
      danger: true,
      confirmLabel: t('btn_delete'),
    });
    if (!ok) return;

    setDeletingVehicleId(v.id);
    try {
      const res = await fetch(`/api/vehicles?id=${encodeURIComponent(v.id)}`, { method: 'DELETE' });
      const data = await readEnvelope(res);
      if (data.success) {
        pushToast(`${v.name} · ${t('btn_delete')} ✓`, 'success');
        await loadVehicles();
      } else {
        pushToast(data.error, 'error');
      }
    } catch (e: any) {
      pushToast(e.message || t('err_delete_vehicle'), 'error');
    } finally {
      setDeletingVehicleId(null);
    }
  }, [deletingVehicleId, t, loadVehicles]);

  const handleSaveVehicle = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingVehicle) return;
    setSavingVehicle(true);
    try {
      const isEdit = Boolean(editingVehicleId);
      const body = vehicleSaveBody({
        form: vehicleForm,
        editingId: editingVehicleId,
        hasSelectedVehicle: Boolean(selectedVehicle),
        currentOdometer: selectedVehicle?.currentOdometer ?? 0,
      });

      const res = await fetch('/api/vehicles', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readEnvelope(res);
      if (data.success) {
        setShowAddVehicleModal(false);
        const savedId = data.data.id || editingVehicleId;
        setVehicleForm(emptyVehicleForm(new Date().getFullYear()));
        setAiProposal(null);
        setEditingVehicleId(null);
        await loadVehicles();
        setSelectedVehicle(data.data);

        // Auto-refresh specifications if vehicle details or engine changed.
        if (isEdit && savedId) {
          fetch('/api/ai/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleId: savedId, forceRefresh: true }),
          })
            .then((r) => r.json())
            .then((res) => {
              if (res.success && res.data) {
                setSelectedVehicle((prev: any) => (prev && prev.id === savedId ? { ...prev, specs: res.data } : prev));
              }
            })
            .catch(() => {});
        }
      } else {
        pushToast(data.error, 'error');
      }
    } catch (err: any) {
      pushToast(err?.message || t('err_request_failed'), 'error');
    } finally {
      setSavingVehicle(false);
    }
  }, [savingVehicle, editingVehicleId, vehicleForm, selectedVehicle, loadVehicles, t]);

  const handleAiLookup = useCallback(async () => {
    if (!vehicleForm.make || !vehicleForm.model) {
      pushToast(t('modal_make_model_required'), 'error');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          make: vehicleForm.make,
          model: vehicleForm.model,
          year: vehicleForm.year,
          engineCc: vehicleForm.engineCc || undefined,
        }),
      });
      const data = await readEnvelope(res);
      if (data.success) {
        setAiProposal(data.data);
        if (data.data.recommendedOil) {
          setVehicleForm((prev) => ({ ...prev, recommendedOil: data.data.recommendedOil }));
        }
      } else {
        setAiError(data.error);
      }
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }, [vehicleForm, t]);

  return {
    vehicles,
    selectedVehicle,
    setSelectedVehicle,
    loading,
    initialLoadDone,
    initialLoadError,
    loadVehicles,
    showAddVehicleModal,
    setShowAddVehicleModal,
    editingVehicleId,
    vehicleForm,
    setVehicleForm,
    savingVehicle,
    deletingVehicleId,
    aiLoading,
    aiProposal,
    aiError,
    openAddVehicleModal,
    openEditVehicleModal,
    handleDeleteVehicle,
    handleSaveVehicle,
    handleAiLookup,
  };
}
