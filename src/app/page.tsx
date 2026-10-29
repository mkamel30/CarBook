'use client';

import React, { useState, useEffect } from 'react';
import { Car, PlusCircle } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

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

export default function WorkbenchPage() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'fuel' | 'maintenance' | 'alerts' | 'manual' | 'doctor' | 'report' | 'settings'>('overview');
  const [, setLoading] = useState(true);

  // Vehicle Form State
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    name: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
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
      { id: 'gasoline_92', name: 'بنزين 92', price: 15.25 },
      { id: 'gasoline_95', name: 'بنزين 95', price: 17.00 },
      { id: 'gasoline_80', name: 'بنزين 80', price: 13.75 },
      { id: 'diesel', name: 'سولار', price: 13.50 },
      { id: 'cng', name: 'غاز طبيعي', price: 7.00 },
    ],
  });
  const [settingsMsg, setSettingsMsg] = useState('');
  const [showFabMenu, setShowFabMenu] = useState(false);

  // Fetch Vehicles
  const loadVehicles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/vehicles');
      const data = await res.json();
      if (data.success) {
        setVehicles(data.data);
        if (data.data.length > 0) {
          setSelectedVehicle((prev: any) => {
            if (!prev) return data.data[0];
            const match = data.data.find((v: any) => v.id === prev.id);
            return match || data.data[0];
          });
        }
      }
    } finally {
      setLoading(false);
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

  const handleLoginGoogle = () => {
    window.location.href = '/api/auth/login';
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCurrentUser(null);
    window.location.reload();
  };

  // Fetch Vehicle Specific Data
  const loadVehicleDetails = async (vehicleId: string) => {
    try {
      const [fuelRes, maintRes, schedRes, repRes] = await Promise.all([
        fetch(`/api/fuel?vehicleId=${vehicleId}`).then(r => r.json()),
        fetch(`/api/maintenance?vehicleId=${vehicleId}`).then(r => r.json()),
        fetch(`/api/schedules?vehicleId=${vehicleId}`).then(r => r.json()),
        fetch(`/api/reports?vehicleId=${vehicleId}`).then(r => r.json()),
      ]);

      if (fuelRes.success) setFuelLogs(fuelRes.data);
      if (maintRes.success) setMaintenanceLogs(maintRes.data);
      if (schedRes.success) setSchedules(schedRes.data.schedules);
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

  // Load Settings
  const loadSettings = async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      setSettings(prev => ({
        ...prev,
        provider: data.data.provider,
        hasApiKey: data.data.hasApiKey,
        maskedApiKey: data.data.maskedApiKey || '',
        fuelTypes: data.data.fuelTypes || prev.fuelTypes,
      }));
    }
  };

  useEffect(() => {
    if (activeTab === 'settings') {
      loadSettings();
    }
  }, [activeTab]);

  // Handle Add Vehicle
  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...vehicleForm,
        initialOdometer: Number(vehicleForm.initialOdometer),
        currentOdometer: Number(vehicleForm.initialOdometer),
        year: Number(vehicleForm.year),
      }),
    });
    const data = await res.json();
    if (data.success) {
      setShowAddVehicleModal(false);
      setVehicleForm({
        name: '',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        licensePlate: '',
        initialOdometer: 0,
        recommendedOil: '',
      });
      setAiProposal(null);
      await loadVehicles();
      setSelectedVehicle(data.data);
    } else {
      alert(data.error);
    }
  };

  // Trigger AI Schedule & Oil Lookup
  const handleAiLookup = async () => {
    if (!vehicleForm.make || !vehicleForm.model) {
      alert('يرجى إدخال الماركة والموديل أولاً');
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
        }),
      });
      const data = await res.json();
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
    if (!confirm(t('confirm_delete_fuel'))) return;
    const res = await fetch(`/api/fuel?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      if (selectedVehicle) {
        loadVehicleDetails(selectedVehicle.id);
        loadVehicles();
      }
    } else {
      alert(data.error);
    }
  };

  // Handle Fuel Submit (Create or Update)
  const handleSaveFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) return;

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

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      setShowFuelModal(false);
      setEditingFuelId(null);
      loadVehicleDetails(selectedVehicle.id);
      loadVehicles();
    } else {
      alert(data.error);
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
    if (!confirm(t('confirm_delete_maint'))) return;
    const res = await fetch(`/api/maintenance?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      if (selectedVehicle) {
        loadVehicleDetails(selectedVehicle.id);
        loadVehicles();
      }
    } else {
      alert(data.error);
    }
  };

  // Handle Maintenance Submit
  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) return;

    const url = '/api/maintenance';
    const method = editingMaintenanceId ? 'PUT' : 'POST';
    const totalPartsCost = partsList.reduce((sum, p) => sum + (Number(p.cost) || 0), 0);
    const labor = Number(maintenanceForm.laborCost) || 0;
    const finalTotal = totalPartsCost + labor;

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

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      setShowMaintenanceModal(false);
      setEditingMaintenanceId(null);
      setPartsList([]);
      loadVehicleDetails(selectedVehicle.id);
      loadVehicles();
    } else {
      alert(data.error);
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
      const data = await res.json();
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
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDoctorHistory(prev => [
          { query: queryText, advice: data.data.advice },
          ...prev,
        ]);
        setDoctorQuery('');
      } else {
        alert(data.error);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDoctorLoading(false);
    }
  };

  // Handle Settings Save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: settings.provider,
        apiKey: settings.apiKey || undefined,
        fuelTypes: settings.fuelTypes,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setSettingsMsg('تم حفظ الإعدادات بنجاح');
      loadSettings();
      setTimeout(() => setSettingsMsg(''), 3000);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900 text-slate-100">
      {/* Desktop & Tablet Sidebar */}
      <Sidebar
        vehicles={vehicles}
        selectedVehicle={selectedVehicle}
        onSelectVehicle={setSelectedVehicle}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAddVehicle={() => setShowAddVehicleModal(true)}
        currentUser={currentUser}
        onLoginGoogle={handleLoginGoogle}
        onLogout={handleLogout}
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
        />

        {/* Desktop Top Header */}
        <DesktopHeader
          selectedVehicle={selectedVehicle}
          onOpenAddFuel={openAddFuelModal}
          onOpenAddMaintenance={openAddMaintenanceModal}
          currentUser={currentUser}
          onLoginGoogle={handleLoginGoogle}
          onLogout={handleLogout}
        />

        {/* Tab Body */}
        <div className="p-4 md:p-6 pb-36 md:pb-6">
          {!selectedVehicle && activeTab !== 'settings' ? (
            <div className="max-w-md mx-auto my-20 text-center bg-slate-950 p-8 rounded-xl border border-slate-800">
              <Car className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-base font-semibold mb-2">{t('app_welcome_title')}</h2>
              <p className="text-xs text-slate-400 mb-6">
                {t('app_welcome_desc')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => setShowAddVehicleModal(true)}
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs inline-flex items-center justify-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" /> {t('app_add_first_car')}
                </button>
                {!currentUser && (
                  <button
                    onClick={handleLoginGoogle}
                    className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-900 font-bold px-4 py-2 rounded text-xs inline-flex items-center justify-center gap-2 shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>دخول بحساب جوجل</span>
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
                  onSaveSettings={handleSaveSettings}
                />
              )}
            </>
          )}
        </div>

        {/* Modals */}
        <AddVehicleModal
          isOpen={showAddVehicleModal}
          onClose={() => setShowAddVehicleModal(false)}
          vehicleForm={vehicleForm}
          setVehicleForm={setVehicleForm}
          aiLoading={aiLoading}
          aiProposal={aiProposal}
          aiError={aiError}
          onAiLookup={handleAiLookup}
          onSaveVehicle={handleSaveVehicle}
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
        />

        <MaintenanceLogModal
          isOpen={showMaintenanceModal}
          onClose={() => setShowMaintenanceModal(false)}
          editingMaintenanceId={editingMaintenanceId}
          maintenanceForm={maintenanceForm}
          setMaintenanceForm={setMaintenanceForm}
          partsList={partsList}
          setPartsList={setPartsList}
          onSaveMaintenance={handleSaveMaintenance}
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
    </div>
  );
}
