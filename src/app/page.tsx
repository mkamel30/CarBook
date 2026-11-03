'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Car, PlusCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { tStatic } from '@/i18n/staticTranslate';
import { evaluateAndNotifySchedules } from '@/services/notifications';

// Layout Components
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileTopBar } from '@/components/layout/MobileTopBar';
import { DesktopHeader } from '@/components/layout/DesktopHeader';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { MobileFab } from '@/components/layout/MobileFab';

// Tab Components
import { OverviewTab } from '@/components/tabs/OverviewTab';
import { FuelTab } from '@/components/tabs/FuelTab';
import { MaintenanceTab } from '@/components/tabs/MaintenanceTab';
import { SchedulesTab } from '@/components/tabs/SchedulesTab';
import { ManualTab } from '@/components/tabs/ManualTab';
import { DoctorTab } from '@/components/tabs/DoctorTab';
import { ReportsTab } from '@/components/tabs/ReportsTab';
import { SettingsTab } from '@/components/tabs/SettingsTab';

// Modal Components
import { AddVehicleModal } from '@/components/modals/AddVehicleModal';
import { FuelLogModal } from '@/components/modals/FuelLogModal';
import { MaintenanceLogModal } from '@/components/modals/MaintenanceLogModal';

// Shared UI primitives (in-app replacements for alert()/confirm())
import { ToastViewport, pushToast } from '@/components/ui/Toast';
import { ConfirmDialogHost, askConfirm } from '@/components/ui/ConfirmDialog';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { UpdateBanner } from '@/components/ui/UpdateBanner';
import { deriveMaintenanceTotal } from '@/components/tabs/maintenanceTotals';

type Envelope = { success: true; data?: any } | { success: false; error: string };

/**
 * Read an API response as an envelope. A reverse proxy answering a 502 with HTML
 * would otherwise make `res.json()` throw inside the handler, leaving the modal
 * open with no message even though the write may already have landed.
 */
async function readEnvelope(res: Response): Promise<Envelope> {
  const httpFailure = tStatic('err_http_status', { status: res.status });
  if (res.status === 401) return { success: false, error: tStatic('err_session_expired') };

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object' || !('success' in body)) {
    return { success: false, error: httpFailure };
  }
  if (body.success) return { success: true, data: body.data };
  return { success: false, error: typeof body.error === 'string' && body.error ? body.error : httpFailure };
}

export default function WorkbenchPage() {
  const { t, lang } = useTranslation();
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'fuel' | 'maintenance' | 'alerts' | 'manual' | 'doctor' | 'report' | 'settings'>('overview');
  const [loading, setLoading] = useState(true);
  // Initial-load truthfulness: a failed first fetch must show an error panel
  // with Retry, never the first-run "add your car" state (it invites duplicate vehicles).
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);

  // Vehicle Form State
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    name: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    engineCc: '',
    licensePlate: '',
    initialOdometer: 0,
    recommendedOil: '',
  });

  // AI Lookup in Add Vehicle Modal
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProposal, setAiProposal] = useState<any | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Fuel Form State
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [editingFuelId, setEditingFuelId] = useState<string | null>(null);
  const [selectedFuelType, setSelectedFuelType] = useState<string>('');
  const [fuelForm, setFuelForm] = useState({
    fillDate: new Date().toISOString().split('T')[0],
    odometer: 0,
    liters: 40,
    pricePerLiter: 15,
    totalCost: 600,
    isFullTank: true,
    notes: '',
  });

  // Maintenance Form State
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [editingMaintenanceId, setEditingMaintenanceId] = useState<string | null>(null);
  const [partsList, setPartsList] = useState<{ id: string; name: string; condition: 'new' | 'used_import'; cost: number }[]>([]);
  const [maintenanceForm, setMaintenanceForm] = useState({
    serviceDate: new Date().toISOString().split('T')[0],
    odometer: 0,
    serviceType: 'oil_change',
    title: '',
    partsCost: 0,
    laborCost: 0,
    totalCost: 0,
    workshop: '',
    notes: '',
    nextDueOdometer: 0,
    nextDueDate: '',
  });

  // Vehicle Data State
  const [fuelLogs, setFuelLogs] = useState<any[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any | null>(null);
  const detailsSeq = useRef(0);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [savingFuel, setSavingFuel] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  // AI Manual & Doctor State
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [doctorQuery, setDoctorQuery] = useState('');
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [doctorHistory, setDoctorHistory] = useState<{ query: string; advice: string }[]>([]);

  // Settings State
  const [settings, setSettings] = useState({
    provider: 'gemini',
    apiKey: '',
    hasApiKey: false,
    maskedApiKey: '',
    fuelTypes: [
      { id: 'gasoline_92', name: 'بنزين 92', price: 22.25 },
      { id: 'gasoline_95', name: 'بنزين 95', price: 24.00 },
      { id: 'gasoline_80', name: 'بنزين 80', price: 20.75 },
      { id: 'diesel', name: 'سولار', price: 20.50 },
      { id: 'cng', name: 'غاز طبيعي', price: 13.00 },
    ],
  });
  const [settingsMsg, setSettingsMsg] = useState('');
  const [settingsError, setSettingsError] = useState('');
  // In-flight guards for destructive deletes (mirrors the saving* flags).
  const [deletingVehicleId, setDeletingVehicleId] = useState<string | null>(null);
  const [deletingFuelId, setDeletingFuelId] = useState<string | null>(null);
  const [deletingMaintenanceId, setDeletingMaintenanceId] = useState<string | null>(null);
  const [showFabMenu, setShowFabMenu] = useState(false);

  // Fetch Vehicles
  const loadVehicles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/vehicles');
      const data = await readEnvelope(res);
      if (data.success) {
        setInitialLoadError(null);
        setVehicles(data.data);
        if (data.data.length > 0) {
          setSelectedVehicle((prev: any) => {
            const next = !prev ? data.data[0] : (data.data.find((v: any) => v.id === prev.id) || data.data[0]);
            // Keep the same object when nothing meaningful changed, otherwise every
            // save hands down a new reference and the details effect loads twice.
            if (prev && next && prev.id === next.id && prev.currentOdometer === next.currentOdometer) {
              return prev;
            }
            return next;
          });
        } else {
          setSelectedVehicle(null);
          setFuelLogs([]);
          setMaintenanceLogs([]);
          setSchedules([]);
          setReportData(null);
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
  };

  const loadAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated) {
        setCurrentUser(data.user);
      } else {
        setCurrentUser(null);
      }
    } catch {}
  };

  useEffect(() => {
    loadAuth();
    loadVehicles();
    loadSettings();
  }, []);

  // Bundled APK: the account handoff finishes AFTER mount (the bearer arrives
  // via deep link), so re-ask /api/auth/me once the shell reports a sign-in.
  useEffect(() => {
    const onHandoff = (e: Event) => {
      if ((e as CustomEvent)?.detail?.kind === 'signedin') loadAuth();
    };
    window.addEventListener('carbook:handoff', onHandoff);
    return () => window.removeEventListener('carbook:handoff', onHandoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoginGoogle = () => {
    // Bundled APK: the shell opens the SERVER login URL in the external browser
    // (Google refuses embedded WebViews); the deep link returns with a code.
    const shell = typeof window !== 'undefined'
      ? (window as { carbookShell?: { openLogin?: () => void } }).carbookShell
      : undefined;
    if (shell?.openLogin) {
      shell.openLogin();
      return;
    }
    window.location.href = '/api/auth/login';
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Bundled APK: drop the stored account bearer too, or the next boot would
    // re-attach a revoked credential.
    (window as { carbookShell?: { clearSession?: () => void } }).carbookShell?.clearSession?.();
    setCurrentUser(null);
    window.location.reload();
  };

  // Fetch Vehicle Specific Data
  const loadVehicleDetails = async (vehicleId: string) => {
    // Only the newest request may write: switching A -> B must not let a slow
    // reply for A land after B's and paint A's logs under B's header.
    const my = ++detailsSeq.current;
    const stale = () => my !== detailsSeq.current;

    try {
      const [fuelRes, maintRes, schedRes, repRes] = await Promise.all([
        fetch(`/api/fuel?vehicleId=${vehicleId}`).then(readEnvelope),
        fetch(`/api/maintenance?vehicleId=${vehicleId}`).then(readEnvelope),
        fetch(`/api/schedules?vehicleId=${vehicleId}`).then(readEnvelope),
        fetch(`/api/reports?vehicleId=${vehicleId}`).then(readEnvelope),
      ]);
      if (stale()) return;

      if (fuelRes.success) setFuelLogs(fuelRes.data);
      if (maintRes.success) setMaintenanceLogs(maintRes.data);
      if (schedRes.success) {
        setSchedules(schedRes.data.schedules);
        const vName = schedRes.data.vehicle?.name || selectedVehicle?.name || '';
        evaluateAndNotifySchedules(schedRes.data.schedules, vName, lang);
      }
      if (repRes.success) {
        setReportData(repRes.data);
        if (repRes.data?.vehicle?.specs) {
          setSelectedVehicle((prev: any) => {
            if (prev && (!prev.specs || (typeof prev.specs === 'object' && Object.keys(prev.specs).length === 0))) {
              return { ...prev, specs: repRes.data.vehicle.specs };
            }
            return prev;
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (selectedVehicle) {
      loadVehicleDetails(selectedVehicle.id);
      setFuelForm(prev => ({ ...prev, odometer: selectedVehicle.currentOdometer }));
      setMaintenanceForm(prev => ({ ...prev, odometer: selectedVehicle.currentOdometer }));
    }
  }, [selectedVehicle]);

  // Keyed on the id alone, so a different car drops the previous one's
  // consultations while a save that only bumps the odometer does not.
  useEffect(() => {
    setDoctorHistory([]);
  }, [selectedVehicle?.id]);

  // Load Settings
  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await readEnvelope(res);
      if (data.success) {
        setSettings(prev => ({
          ...prev,
          provider: data.data.provider,
          hasApiKey: data.data.hasApiKey,
          maskedApiKey: data.data.maskedApiKey || '',
          fuelTypes: data.data.fuelTypes || prev.fuelTypes,
        }));
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'settings') {
      loadSettings();
    }
  }, [activeTab]);

  const openAddVehicleModal = () => {
    setEditingVehicleId(null);
    setVehicleForm({
      name: '',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      engineCc: '',
      licensePlate: '',
      initialOdometer: 0,
      recommendedOil: '',
    });
    setAiProposal(null);
    setAiError(null);
    setShowAddVehicleModal(true);
  };

  const openEditVehicleModal = (v: any) => {
    if (!v) return;
    setEditingVehicleId(v.id);
    setVehicleForm({
      name: v.name,
      make: v.make,
      model: v.model,
      year: Number(v.year),
      engineCc: v.engineCc || '',
      licensePlate: v.licensePlate || '',
      initialOdometer: Number(v.initialOdometer || 0),
      recommendedOil: v.recommendedOil || '',
    });
    setAiProposal(null);
    setAiError(null);
    setShowAddVehicleModal(true);
  };

  const handleDeleteVehicle = async (v: any) => {
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
      const res = await fetch(`/api/vehicles?id=${encodeURIComponent(v.id)}`, {
        method: 'DELETE',
      });
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
  };

  // Handle Add or Edit Vehicle
  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingVehicle) return;
    setSavingVehicle(true);
    try {
      const isEdit = Boolean(editingVehicleId);
      const url = '/api/vehicles';
      const method = isEdit ? 'PUT' : 'POST';
      const body = {
        ...(isEdit ? { id: editingVehicleId } : {}),
        ...vehicleForm,
        initialOdometer: Number(vehicleForm.initialOdometer),
        currentOdometer: isEdit && selectedVehicle ? selectedVehicle.currentOdometer : Number(vehicleForm.initialOdometer),
        year: Number(vehicleForm.year),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readEnvelope(res);
      if (data.success) {
        setShowAddVehicleModal(false);
        const savedId = data.data.id || editingVehicleId;
        setVehicleForm({
          name: '',
          make: '',
          model: '',
          year: new Date().getFullYear(),
          engineCc: '',
          licensePlate: '',
          initialOdometer: 0,
          recommendedOil: '',
        });
        setAiProposal(null);
        setEditingVehicleId(null);
        await loadVehicles();
        setSelectedVehicle(data.data);

        // Auto-refresh specifications if vehicle details or engine changed
        if (isEdit && savedId) {
          fetch('/api/ai/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleId: savedId, forceRefresh: true }),
          })
            .then(r => r.json())
            .then(res => {
              if (res.success && res.data) {
                setSelectedVehicle((prev: any) => prev && prev.id === savedId ? { ...prev, specs: res.data } : prev);
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
  };

  // Trigger AI Schedule & Oil Lookup
  const handleAiLookup = async () => {
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
          setVehicleForm(prev => ({ ...prev, recommendedOil: data.data.recommendedOil }));
        }
      } else {
        setAiError(data.error);
      }
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // Open Fuel Modal (Add or Edit)
  const openAddFuelModal = () => {
    setEditingFuelId(null);
    const lastLog = fuelLogs.length > 0 ? fuelLogs[0] : null;
    let selectedFuel = settings.fuelTypes?.[0];

    if (lastLog) {
      const match = settings.fuelTypes?.find(
        f => f.name === lastLog.notes || Math.abs(f.price - lastLog.pricePerLiter) < 0.01
      );
      if (match) {
        selectedFuel = match;
      }
    }

    const fuelTypeId = selectedFuel ? selectedFuel.id : (lastLog ? 'custom' : '');
    const price = lastLog ? lastLog.pricePerLiter : (selectedFuel ? selectedFuel.price : 15);
    const fuelName = lastLog?.notes || selectedFuel?.name || '';

    setSelectedFuelType(fuelTypeId);
    setFuelForm({
      fillDate: new Date().toISOString().split('T')[0],
      odometer: selectedVehicle?.currentOdometer || 0,
      liters: 0,
      pricePerLiter: price,
      totalCost: 0,
      isFullTank: true,
      notes: fuelName,
    });
    setShowFuelModal(true);
  };

  const openEditFuelModal = (log: any) => {
    setEditingFuelId(log.id);
    const matchedType = settings.fuelTypes?.find(f => f.price === log.pricePerLiter || f.name === log.notes);
    setSelectedFuelType(matchedType ? matchedType.id : 'custom');
    setFuelForm({
      fillDate: log.fillDate,
      odometer: log.odometer,
      liters: log.liters,
      pricePerLiter: log.pricePerLiter,
      totalCost: log.totalCost,
      isFullTank: log.isFullTank,
      notes: log.notes || '',
    });
    setShowFuelModal(true);
  };

  const handleDeleteFuel = async (id: string) => {
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
          loadVehicleDetails(selectedVehicle.id);
          loadVehicles();
        }
      } else {
        pushToast(data.error, 'error');
      }
    } catch (e: any) {
      pushToast(e?.message || t('err_delete_fuel'), 'error');
    } finally {
      setDeletingFuelId(null);
    }
  };

  // Handle Fuel Submit (Create or Update)
  const handleSaveFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || savingFuel) return;
    setSavingFuel(true);

    const url = '/api/fuel';
    const method = editingFuelId ? 'PUT' : 'POST';
    const payload = {
      ...(editingFuelId ? { id: editingFuelId } : {}),
      ...fuelForm,
      vehicleId: selectedVehicle.id,
      odometer: Number(fuelForm.odometer),
      liters: Number(fuelForm.liters),
      pricePerLiter: Number(fuelForm.pricePerLiter),
      totalCost: Number(fuelForm.totalCost),
    };

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
        loadVehicleDetails(selectedVehicle.id);
        loadVehicles();
      } else {
        pushToast(data.error, 'error');
      }
    } catch (err: any) {
      pushToast(err?.message || t('err_request_failed'), 'error');
    } finally {
      setSavingFuel(false);
    }
  };

  // Open Maintenance Modal (Add or Edit)
  const openAddMaintenanceModal = () => {
    setEditingMaintenanceId(null);
    setPartsList([]);
    setMaintenanceForm({
      serviceDate: new Date().toISOString().split('T')[0],
      odometer: selectedVehicle?.currentOdometer || 0,
      serviceType: 'oil_change',
      title: '',
      partsCost: 0,
      laborCost: 0,
      totalCost: 0,
      workshop: '',
      notes: '',
      nextDueOdometer: 0,
      nextDueDate: '',
    });
    setShowMaintenanceModal(true);
  };

  const openEditMaintenanceModal = (log: any) => {
    setEditingMaintenanceId(log.id);
    const existingParts = log.partsList || [];
    setPartsList(existingParts.map((p: any, idx: number) => ({
      id: p.id || `p_${Date.now()}_${idx}`,
      name: p.name,
      condition: p.condition || 'new',
      cost: Number(p.cost) || 0,
    })));
    setMaintenanceForm({
      serviceDate: log.serviceDate,
      odometer: log.odometer,
      serviceType: log.serviceType,
      title: log.title,
      partsCost: log.partsCost || 0,
      laborCost: log.laborCost || 0,
      totalCost: log.totalCost || 0,
      workshop: log.workshop || '',
      notes: log.notes || '',
      nextDueOdometer: log.nextDueOdometer || 0,
      nextDueDate: log.nextDueDate || '',
    });
    setShowMaintenanceModal(true);
  };

  const handleDeleteMaintenance = async (id: string) => {
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
          loadVehicleDetails(selectedVehicle.id);
          loadVehicles();
        }
      } else {
        pushToast(data.error, 'error');
      }
    } catch (e: any) {
      pushToast(e?.message || t('err_delete_maint'), 'error');
    } finally {
      setDeletingMaintenanceId(null);
    }
  };

  // Handle Maintenance Submit
  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || savingMaintenance) return;
    setSavingMaintenance(true);

    const url = '/api/maintenance';
    const method = editingMaintenanceId ? 'PUT' : 'POST';
    const totalPartsCost = partsList.reduce((sum, p) => sum + (Number(p.cost) || 0), 0);
    const labor = Number(maintenanceForm.laborCost) || 0;
    // Additive, honest rule (see maintenanceTotals.ts): when parts or labor are
    // filled the grand total is their sum; when both are 0/empty we honor the
    // typed lump-sum total instead of silently overwriting it.
    const { total: finalTotal } = deriveMaintenanceTotal(totalPartsCost, labor, maintenanceForm.totalCost);

    const payload = {
      ...(editingMaintenanceId ? { id: editingMaintenanceId } : {}),
      ...maintenanceForm,
      vehicleId: selectedVehicle.id,
      odometer: Number(maintenanceForm.odometer),
      partsList: partsList.length > 0 ? partsList : null,
      partsCost: totalPartsCost,
      laborCost: labor,
      totalCost: finalTotal,
      nextDueOdometer: maintenanceForm.nextDueOdometer ? Number(maintenanceForm.nextDueOdometer) : undefined,
    };

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
        loadVehicleDetails(selectedVehicle.id);
        loadVehicles();
      } else {
        pushToast(data.error, 'error');
      }
    } catch (err: any) {
      pushToast(err?.message || t('err_request_failed'), 'error');
    } finally {
      setSavingMaintenance(false);
    }
  };

  // Fetch OEM Manual Specs via AI
  const handleFetchManual = async () => {
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
        loadVehicles();
      } else {
        setManualError(data.error);
      }
    } catch (e: any) {
      setManualError(e.message);
    } finally {
      setManualLoading(false);
    }
  };

  // Ask AI Car Doctor
  const handleAskDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || !doctorQuery.trim()) return;
    const queryText = doctorQuery.trim();
    setDoctorLoading(true);
    try {
      const res = await fetch('/api/ai/doctor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: selectedVehicle.id,
          query: queryText,
          lang,
        }),
      });
      const data = await readEnvelope(res);
      if (data.success) {
        setDoctorHistory(prev => [
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
  };

  // Handle Settings Save — success and failure must never share one message slot.
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsMsg('');
    setSettingsError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.provider,
          apiKey: settings.apiKey || undefined,
          fuelTypes: settings.fuelTypes,
        }),
      });
      const data = await readEnvelope(res);
      if (data.success) {
        setSettingsMsg(t('set_save_success'));
        setTimeout(() => setSettingsMsg(''), 3000);
        loadSettings();
      } else {
        setSettingsError(data.error || t('err_request_failed'));
      }
    } catch (err: any) {
      setSettingsError(err?.message || t('err_request_failed'));
    }
  };

  const urgentCount = schedules.filter(
    (s) => s.status === 'overdue' || s.status === 'due_soon'
  ).length;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900 text-slate-100">
      {/* Desktop & Tablet Sidebar */}
      <Sidebar
        vehicles={vehicles}
        selectedVehicle={selectedVehicle}
        onSelectVehicle={setSelectedVehicle}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAddVehicle={openAddVehicleModal}
        onEditVehicle={openEditVehicleModal}
        onDeleteVehicle={handleDeleteVehicle}
        currentUser={currentUser}
        onLoginGoogle={handleLoginGoogle}
        onLogout={handleLogout}
        urgentCount={urgentCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Mobile M3 Top App Bar */}
        <MobileTopBar
          vehicles={vehicles}
          selectedVehicle={selectedVehicle}
          onSelectVehicle={setSelectedVehicle}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          currentUser={currentUser}
          onLoginGoogle={handleLoginGoogle}
          onLogout={handleLogout}
          urgentCount={urgentCount}
        />

        {/* Desktop Top Header */}
        <DesktopHeader
          selectedVehicle={selectedVehicle}
          onOpenAddFuel={openAddFuelModal}
          onOpenAddMaintenance={openAddMaintenanceModal}
          currentUser={currentUser}
          onLoginGoogle={handleLoginGoogle}
          onLogout={handleLogout}
          urgentCount={urgentCount}
          onSelectTab={setActiveTab}
        />

        {/* APK In-App Update Banner */}
        <UpdateBanner />

        {/* Tab Body */}
        <div className="p-4 md:p-6 pb-36 md:pb-6">
          {/* Urgent Maintenance Banner */}
          {selectedVehicle && urgentCount > 0 && activeTab !== 'alerts' && (
            <div className="mb-4 bg-rose-950/40 border border-rose-900/80 rounded-xl p-3 sm:p-3.5 flex items-center justify-between gap-3 text-xs text-rose-200 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-semibold truncate">
                  {t('notif_urgent_banner')} — {t('notif_urgent_items', { count: urgentCount }, urgentCount)}
                </span>
              </div>
              <button
                onClick={() => setActiveTab('alerts')}
                className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs shrink-0 transition active:scale-95 shadow-sm"
              >
                {t('notif_view_alerts')}
              </button>
            </div>
          )}

          {loading && !initialLoadDone ? (
            /* Initial data load: skeleton instead of a flash of the empty state */
            <div className="max-w-4xl mx-auto space-y-4 animate-pulse" role="status" aria-label={t('ov_calculating')}>
              <div className="h-20 bg-slate-950 border border-slate-800 rounded-xl" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-slate-950 border border-slate-800 rounded-lg" />
                ))}
              </div>
              <div className="h-48 bg-slate-950 border border-slate-800 rounded-lg" />
              <span className="sr-only">{t('ov_calculating')}…</span>
            </div>
          ) : initialLoadError && vehicles.length === 0 && activeTab !== 'settings' ? (
            /* Initial fetch FAILURE: honest error panel with Retry — never the
               first-run "add your car" state, which invites duplicate vehicles. */
            <div className="max-w-md mx-auto my-20 text-center bg-slate-950 p-8 rounded-xl border border-rose-900/60">
              <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
              <h2 className="text-base font-semibold mb-2 text-rose-200">{t('load_error_title')}</h2>
              <p className="text-xs text-slate-400 mb-2">{t('load_error_desc')}</p>
              <p className="text-[11px] text-slate-500 font-mono mb-6 break-words">{initialLoadError}</p>
              <button
                onClick={() => loadVehicles()}
                disabled={loading}
                className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded text-xs inline-flex items-center justify-center gap-2 transition"
              >
                {t('btn_retry')}
              </button>
            </div>
          ) : !selectedVehicle && activeTab !== 'settings' ? (
            <div className="max-w-md mx-auto my-20 text-center bg-slate-950 p-8 rounded-xl border border-slate-800">
              <Car className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-base font-semibold mb-2">{t('app_welcome_title')}</h2>
              <p className="text-xs text-slate-400 mb-6">
                {t('app_welcome_desc')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={openAddVehicleModal}
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs inline-flex items-center justify-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" /> {t('app_add_first_car')}
                </button>
                {!currentUser && (
                  <button
                    onClick={handleLoginGoogle}
                    className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-900 font-bold px-4 py-2 rounded text-xs inline-flex items-center justify-center gap-2 shadow-sm"
                  >
                    <GoogleIcon className="w-3.5 h-3.5" />
                    <span>{t('btn_login_google')}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewTab
                  selectedVehicle={selectedVehicle}
                  reportData={reportData}
                  fuelLogs={fuelLogs}
                  maintenanceLogs={maintenanceLogs}
                  schedules={schedules}
                  onSelectTab={setActiveTab}
                  onEditVehicle={openEditVehicleModal}
                  onDeleteVehicle={handleDeleteVehicle}
                  onOpenAddVehicle={openAddVehicleModal}
                />
              )}

              {activeTab === 'fuel' && (
                <FuelTab
                  selectedVehicle={selectedVehicle}
                  fuelLogs={fuelLogs}
                  onOpenAddFuel={openAddFuelModal}
                  onOpenEditFuel={openEditFuelModal}
                  onDeleteFuel={handleDeleteFuel}
                />
              )}

              {activeTab === 'maintenance' && (
                <MaintenanceTab
                  selectedVehicle={selectedVehicle}
                  maintenanceLogs={maintenanceLogs}
                  onOpenAddMaintenance={openAddMaintenanceModal}
                  onOpenEditMaintenance={openEditMaintenanceModal}
                  onDeleteMaintenance={handleDeleteMaintenance}
                />
              )}

              {activeTab === 'alerts' && (
                <SchedulesTab
                  schedules={schedules}
                  currentOdometer={selectedVehicle?.currentOdometer || 0}
                  vehicleId={selectedVehicle?.id}
                  onRefresh={() => selectedVehicle && loadVehicleDetails(selectedVehicle.id)}
                />
              )}

              {activeTab === 'manual' && (
                <ManualTab
                  selectedVehicle={selectedVehicle}
                  manualLoading={manualLoading}
                  manualError={manualError}
                  onFetchManual={handleFetchManual}
                />
              )}

              {activeTab === 'doctor' && (
                <DoctorTab
                  selectedVehicle={selectedVehicle}
                  doctorQuery={doctorQuery}
                  setDoctorQuery={setDoctorQuery}
                  doctorLoading={doctorLoading}
                  doctorHistory={doctorHistory}
                  onAskDoctor={handleAskDoctor}
                />
              )}

              {activeTab === 'report' && (
                <ReportsTab
                  selectedVehicle={selectedVehicle}
                  reportData={reportData}
                  maintenanceLogs={maintenanceLogs}
                  fuelLogs={fuelLogs}
                  manualLoading={manualLoading}
                  onFetchManual={handleFetchManual}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsTab
                  settings={settings}
                  setSettings={setSettings}
                  settingsMsg={settingsMsg}
                  settingsError={settingsError}
                  onSaveSettings={handleSaveSettings}
                  currentUser={currentUser}
                  onLoginGoogle={handleLoginGoogle}
                  onLogout={handleLogout}
                  onDataRestored={() => {
                    loadVehicles();
                    if (selectedVehicle) loadVehicleDetails(selectedVehicle.id);
                  }}
                />
              )}
            </>
          )}
        </div>

        {/* Modals */}
        <AddVehicleModal
          isOpen={showAddVehicleModal}
          isEdit={Boolean(editingVehicleId)}
          onClose={() => setShowAddVehicleModal(false)}
          vehicleForm={vehicleForm}
          setVehicleForm={setVehicleForm}
          aiLoading={aiLoading}
          aiProposal={aiProposal}
          aiError={aiError}
          onAiLookup={handleAiLookup}
          onSaveVehicle={handleSaveVehicle}
          saving={savingVehicle}
        />

        <FuelLogModal
          isOpen={showFuelModal}
          onClose={() => setShowFuelModal(false)}
          editingFuelId={editingFuelId}
          fuelForm={fuelForm}
          setFuelForm={setFuelForm}
          selectedFuelType={selectedFuelType}
          setSelectedFuelType={setSelectedFuelType}
          settings={settings}
          onSaveFuel={handleSaveFuel}
          saving={savingFuel}
          minOdometer={editingFuelId ? 0 : selectedVehicle?.currentOdometer ?? 0}
        />

        <MaintenanceLogModal
          isOpen={showMaintenanceModal}
          onClose={() => setShowMaintenanceModal(false)}
          editingMaintenanceId={editingMaintenanceId}
          maintenanceForm={maintenanceForm}
          setMaintenanceForm={setMaintenanceForm}
          partsList={partsList}
          setPartsList={setPartsList}
          schedules={schedules}
          onSaveMaintenance={handleSaveMaintenance}
          saving={savingMaintenance}
          minOdometer={editingMaintenanceId ? 0 : selectedVehicle?.currentOdometer ?? 0}
        />

        {/* Mobile Material You Floating Action Button (FAB) */}
        <MobileFab
          selectedVehicle={selectedVehicle}
          showFabMenu={showFabMenu}
          setShowFabMenu={setShowFabMenu}
          onOpenAddFuel={openAddFuelModal}
          onOpenAddMaintenance={openAddMaintenanceModal}
        />

        {/* Mobile Material You Bottom Navigation Bar */}
        <MobileBottomNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />
      </main>

      {/* In-app alert()/confirm() replacements (single host pair for the whole app) */}
      <ToastViewport />
      <ConfirmDialogHost />
    </div>
  );
}
