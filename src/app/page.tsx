'use client';

import React, { useState, useEffect } from 'react';
import {
  Car,
  Fuel,
  Wrench,
  AlertTriangle,
  FileText,
  Settings,
  PlusCircle,
  CheckCircle2,
  Sparkles,
  Printer,
  ChevronRight,
  TrendingDown,
  Gauge,
  Edit2,
  Trash2,
  BookOpen,
  HelpCircle,
  Send,
  Loader2,
  Check,
  ShieldCheck,
  Globe,
  FileSpreadsheet
} from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import {
  exportVehicleDossierToExcel,
  exportMaintenanceToExcel,
  exportFuelToExcel
} from '@/services/exportExcel';

export default function WorkbenchPage() {
  const { t, lang, setLang, dir, languages } = useTranslation();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'fuel' | 'maintenance' | 'alerts' | 'manual' | 'doctor' | 'report' | 'settings'>('overview');
  const [loading, setLoading] = useState(true);

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

  // Fetch Vehicles
  const loadVehicles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/vehicles');
      const data = await res.json();
      if (data.success) {
        setVehicles(data.data);
        if (data.data.length > 0 && !selectedVehicle) {
          setSelectedVehicle(data.data[0]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
    loadSettings();
  }, []);

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
      if (repRes.success) setReportData(repRes.data);
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
    // Remember the fuel type and price from the most recent fuel log if available
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
      {/* Sidebar / Navigation */}
      <aside className={`w-64 bg-slate-950 flex flex-col justify-between shrink-0 ${dir === 'rtl' ? 'border-l' : 'border-r'} border-slate-800`}>
        <div>
          {/* App Branding */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Car className="text-amber-500 w-6 h-6 shrink-0" />
              <div>
                <h1 className="font-bold text-sm tracking-wide">CarBook</h1>
                <p className="text-xs text-slate-400">{t('app_tagline')}</p>
              </div>
            </div>
          </div>

          {/* Vehicle Selector */}
          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase">{t('nav_current_vehicle')}</span>
              <button
                onClick={() => setShowAddVehicleModal(true)}
                className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1 font-medium"
              >
                <PlusCircle className="w-3.5 h-3.5" /> {t('nav_add_vehicle')}
              </button>
            </div>
            {vehicles.length === 0 ? (
              <div className="text-xs text-slate-500 p-2 text-center bg-slate-900 rounded border border-dashed border-slate-800">
                {t('app_no_vehicles')}
              </div>
            ) : (
              <select
                className="w-full bg-slate-900 border border-slate-700 text-xs rounded p-2 text-slate-200 outline-none focus:border-amber-500"
                value={selectedVehicle?.id || ''}
                onChange={e => {
                  const v = vehicles.find(item => item.id === e.target.value);
                  setSelectedVehicle(v || null);
                }}
              >
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.make} {v.model})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="p-2 space-y-1 text-sm">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'overview'
                  ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Gauge className="w-4 h-4 shrink-0" /> {t('nav_overview')}
            </button>
            <button
              onClick={() => setActiveTab('fuel')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'fuel'
                  ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Fuel className="w-4 h-4 shrink-0" /> {t('nav_fuel')}
            </button>
            <button
              onClick={() => setActiveTab('maintenance')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'maintenance'
                  ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Wrench className="w-4 h-4 shrink-0" /> {t('nav_maintenance')}
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'alerts'
                  ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" /> {t('nav_alerts')}
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'manual'
                  ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0" /> {t('nav_manual')}
            </button>
            <button
              onClick={() => setActiveTab('doctor')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'doctor'
                  ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <HelpCircle className="w-4 h-4 shrink-0" /> {t('nav_doctor')}
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'report'
                  ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" /> {t('nav_report')}
            </button>
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-slate-800 space-y-2">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition ${
              activeTab === 'settings' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" /> {t('nav_settings')}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Top Header */}
        <header className="h-14 border-b border-slate-800 bg-slate-950/60 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            {selectedVehicle ? (
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm">{selectedVehicle.name}</span>
                <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                  {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year})
                </span>
                {selectedVehicle.licensePlate && (
                  <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-mono">
                    {selectedVehicle.licensePlate}
                  </span>
                )}
                <div className={`text-xs text-slate-400 flex items-center gap-1 ${dir === 'rtl' ? 'border-r pr-3 mr-3' : 'border-l pl-3 ml-3'} border-slate-800`}>
                  <span>{t('header_odometer')}</span>
                  <span className="font-bold text-amber-400 font-mono">{selectedVehicle.currentOdometer.toLocaleString()} {t('unit_km')}</span>
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-400">{t('app_select_prompt')}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              title="Change Language / تغيير اللغة"
            >
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
            </button>

            {selectedVehicle && (
              <>
                <button
                  onClick={openAddFuelModal}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition"
                >
                  <Fuel className="w-3.5 h-3.5" /> {t('btn_add_fuel')}
                </button>
                <button
                  onClick={openAddMaintenanceModal}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 border border-slate-700 transition"
                >
                  <Wrench className="w-3.5 h-3.5" /> {t('btn_add_maintenance')}
                </button>
              </>
            )}
          </div>
        </header>

        {/* Tab Body */}
        <div className="p-6">
          {!selectedVehicle && activeTab !== 'settings' ? (
            <div className="max-w-md mx-auto my-20 text-center bg-slate-950 p-8 rounded-xl border border-slate-800">
              <Car className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-base font-semibold mb-2">{t('app_welcome_title')}</h2>
              <p className="text-xs text-slate-400 mb-6">
                {t('app_welcome_desc')}
              </p>
              <button
                onClick={() => setShowAddVehicleModal(true)}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs inline-flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" /> {t('app_add_first_car')}
              </button>
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Key Metrics Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">{t('ov_current_odometer')}</div>
                      <div className="text-xl font-bold text-amber-400 font-mono">
                        {selectedVehicle.currentOdometer.toLocaleString()} <span className="text-xs font-normal text-slate-400">{t('unit_km')}</span>
                      </div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">{t('ov_avg_consumption')}</div>
                      <div className="text-xl font-bold text-emerald-400 font-mono">
                        {reportData?.summary?.averageLitersPer100Km ? `${reportData.summary.averageLitersPer100Km} ${t('unit_l_per_100km')}` : t('ov_calculating')}
                      </div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">{t('ov_total_fuel_cost')}</div>
                      <div className="text-xl font-bold text-slate-100 font-mono">
                        {reportData?.summary?.totalFuelCost?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-400">{t('unit_currency')}</span>
                      </div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">{t('ov_total_maint_cost')}</div>
                      <div className="text-xl font-bold text-slate-100 font-mono">
                        {reportData?.summary?.totalMaintenanceCost?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-400">{t('unit_currency')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Urgent Alerts Preview */}
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <h3 className="font-semibold text-xs text-slate-200">{t('ov_upcoming_alerts')}</h3>
                      </div>
                      <button onClick={() => setActiveTab('alerts')} className="text-xs text-amber-400 hover:underline">
                        {t('ov_view_all')}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {schedules.slice(0, 4).map((s, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded border text-xs flex items-center justify-between ${
                            s.status === 'overdue'
                              ? 'bg-rose-950/20 border-rose-900/50 text-rose-300'
                              : s.status === 'due_soon'
                              ? 'bg-amber-950/20 border-amber-900/50 text-amber-300'
                              : 'bg-slate-900 border-slate-800 text-slate-300'
                          }`}
                        >
                          <div>
                            <div className="font-semibold">{lang === 'en' ? (s.schedule.titleEn || s.schedule.titleAr) : s.schedule.titleAr}</div>
                            <div className="text-[11px] opacity-80">
                              {lang === 'en'
                                ? (s.status === 'overdue' ? `Overdue by ${Math.abs(s.remainingKm || 0).toLocaleString()} km` : s.status === 'due_soon' ? `Due soon (${s.remainingKm?.toLocaleString()} km remaining)` : `Good condition (${s.remainingKm?.toLocaleString()} km remaining)`)
                                : s.alertMessageAr}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              s.status === 'overdue'
                                ? 'bg-rose-500 text-white'
                                : s.status === 'due_soon'
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {s.status === 'overdue' ? t('alerts_status_overdue') : s.status === 'due_soon' ? t('alerts_status_due_soon') : t('alerts_status_ok')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Logs Preview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Recent Fuel */}
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-xs text-slate-200 flex items-center gap-1.5">
                          <Fuel className="w-3.5 h-3.5 text-amber-400" /> {t('ov_recent_fuel')}
                        </h3>
                        <button onClick={() => setActiveTab('fuel')} className="text-xs text-amber-400 hover:underline">
                          {t('ov_view_all')}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {fuelLogs.length === 0 ? (
                          <div className="text-xs text-slate-500 text-center py-4">{t('ov_no_logs_yet')}</div>
                        ) : (
                          fuelLogs.slice(0, 3).map((f, idx) => (
                            <div key={idx} className="bg-slate-900 p-2.5 rounded text-xs flex justify-between items-center">
                              <div>
                                <div className="font-medium text-slate-200 font-mono">{f.fillDate} — {f.odometer.toLocaleString()} {t('unit_km')}</div>
                                <div className="text-slate-400 text-[11px]">
                                  {f.liters} {t('unit_liter')} ({f.pricePerLiter} {t('unit_currency')}/{t('unit_liter')})
                                  {f.litersPer100Km && (
                                    <span className="text-emerald-400 mx-2 font-mono">
                                      • {f.litersPer100Km} {t('unit_l_per_100km')} ({f.costPerKm} {t('unit_currency')}/{t('unit_km')})
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="font-bold text-amber-400 font-mono">{f.totalCost} {t('unit_currency')}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Recent Maintenance */}
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-xs text-slate-200 flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-amber-400" /> {t('ov_recent_maint')}
                        </h3>
                        <button onClick={() => setActiveTab('maintenance')} className="text-xs text-amber-400 hover:underline">
                          {t('ov_view_all')}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {maintenanceLogs.length === 0 ? (
                          <div className="text-xs text-slate-500 text-center py-4">{t('ov_no_logs_yet')}</div>
                        ) : (
                          maintenanceLogs.slice(0, 3).map((m, idx) => (
                            <div key={idx} className="bg-slate-900 p-2.5 rounded text-xs flex justify-between items-center">
                              <div>
                                <div className="font-medium text-slate-200">{m.title}</div>
                                <div className="text-slate-400 text-[11px] font-mono">{m.serviceDate} — {m.odometer.toLocaleString()} {t('unit_km')}</div>
                              </div>
                              <div className="font-bold text-slate-200 font-mono">{m.totalCost} {t('unit_currency')}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Fuel Logs Tab */}
              {activeTab === 'fuel' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-200">{t('fuel_title')}</h2>
                      <p className="text-xs text-slate-400 mt-0.5">{t('fuel_desc')}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => exportFuelToExcel(selectedVehicle, fuelLogs, lang)}
                        className="bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-500/50 px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition"
                        title={t('rep_btn_excel_fuel')}
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> {t('rep_btn_excel_fuel')}
                      </button>
                      <button
                        onClick={openAddFuelModal}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> {t('fuel_btn_new')}
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-start text-xs">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="p-3 text-start">{t('fuel_th_date')}</th>
                          <th className="p-3 text-start">{t('fuel_th_odometer')}</th>
                          <th className="p-3 text-start">{t('fuel_th_liters')}</th>
                          <th className="p-3 text-start">{t('fuel_th_price_per_l')}</th>
                          <th className="p-3 text-start">{t('fuel_th_total_cost')}</th>
                          <th className="p-3 text-start">{t('fuel_th_consumption')}</th>
                          <th className="p-3 text-start">{t('fuel_th_cost_per_km')}</th>
                          <th className="p-3 text-start">{t('fuel_th_type')}</th>
                          <th className="p-3 text-start">{t('fuel_th_notes')}</th>
                          <th className="p-3 text-center">{t('fuel_th_actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {fuelLogs.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="p-6 text-center text-xs text-slate-500">
                              {t('fuel_empty_state')}
                            </td>
                          </tr>
                        ) : (
                          fuelLogs.map((log, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/50">
                              <td className="p-3 font-mono">{log.fillDate}</td>
                              <td className="p-3 font-semibold text-amber-400 font-mono">{log.odometer.toLocaleString()} {t('unit_km')}</td>
                              <td className="p-3 font-mono">{log.liters} {t('unit_liter')}</td>
                              <td className="p-3 font-mono">{log.pricePerLiter} {t('unit_currency')}</td>
                              <td className="p-3 font-bold font-mono">{log.totalCost} {t('unit_currency')}</td>
                              <td className="p-3">
                                {log.litersPer100Km ? (
                                  <span className="bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded font-mono font-bold">
                                    {log.litersPer100Km} {t('unit_l_per_100km')}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-[11px]">—</span>
                                )}
                              </td>
                              <td className="p-3">
                                {log.costPerKm ? (
                                  <span className="bg-amber-950/60 text-amber-300 border border-amber-800/50 px-2 py-0.5 rounded font-mono font-bold">
                                    {log.costPerKm} {t('unit_currency')}/{t('unit_km')}
                                  </span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] ${log.isFullTank ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                                  {log.isFullTank ? t('fuel_full_badge') : t('fuel_partial_badge')}
                                </span>
                              </td>
                              <td className="p-3 text-slate-400">{log.notes || '—'}</td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => openEditFuelModal(log)}
                                    className="text-amber-400 hover:text-amber-300 p-1 rounded hover:bg-slate-800 transition"
                                    title={t('btn_edit')}
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFuel(log.id)}
                                    className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-slate-800 transition"
                                    title={t('btn_delete')}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Maintenance Logs Tab */}
              {activeTab === 'maintenance' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-200">{t('maint_title')}</h2>
                      <p className="text-xs text-slate-400 mt-0.5">{t('maint_desc')}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => exportMaintenanceToExcel(selectedVehicle, maintenanceLogs, lang)}
                        className="bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-500/50 px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition"
                        title={t('rep_btn_excel_maint')}
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> {t('rep_btn_excel_maint')}
                      </button>
                      <button
                        onClick={openAddMaintenanceModal}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> {t('maint_btn_new')}
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-start text-xs">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="p-3 text-start">{t('maint_th_date')}</th>
                          <th className="p-3 text-start">{t('maint_th_odometer')}</th>
                          <th className="p-3 text-start">{t('maint_th_service')}</th>
                          <th className="p-3 text-start">{t('maint_th_costs')}</th>
                          <th className="p-3 text-start">{t('maint_th_total')}</th>
                          <th className="p-3 text-start">{t('maint_th_workshop')}</th>
                          <th className="p-3 text-center">{t('maint_th_actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {maintenanceLogs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-xs text-slate-500">
                              {t('maint_empty_state')}
                            </td>
                          </tr>
                        ) : (
                          maintenanceLogs.map((log, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/50">
                              <td className="p-3 font-mono">{log.serviceDate}</td>
                              <td className="p-3 font-semibold text-amber-400 font-mono">{log.odometer.toLocaleString()} {t('unit_km')}</td>
                              <td className="p-3 font-medium text-slate-100">
                                <div>{log.title}</div>
                                {log.partsList && log.partsList.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {log.partsList.map((p: any, pIdx: number) => (
                                      <span key={pIdx} className="text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">
                                        {p.name} ({p.condition === 'new' ? t('maint_cond_new') : t('maint_cond_used')} - {p.cost} {t('unit_currency')})
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="p-3 text-slate-400 font-mono">
                                {log.partsCost} {t('unit_currency')} ({t('maint_parts_count')}) + {log.laborCost} {t('unit_currency')} ({t('maint_labor')})
                              </td>
                              <td className="p-3 font-bold text-amber-400 font-mono">{log.totalCost} {t('unit_currency')}</td>
                              <td className="p-3 text-slate-400">{log.workshop || '—'}</td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => openEditMaintenanceModal(log)}
                                    className="text-amber-400 hover:text-amber-300 p-1 rounded hover:bg-slate-800 transition"
                                    title={t('btn_edit')}
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteMaintenance(log.id)}
                                    className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-slate-800 transition"
                                    title={t('btn_delete')}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Maintenance Schedule & Alerts Tab */}
              {activeTab === 'alerts' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">{t('alerts_title')}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{t('alerts_desc')}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {schedules.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-lg border text-xs flex flex-col justify-between ${
                          item.status === 'overdue'
                            ? 'bg-rose-950/20 border-rose-900 text-rose-200'
                            : item.status === 'due_soon'
                            ? 'bg-amber-950/20 border-amber-900 text-amber-200'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-sm text-slate-100">
                              {lang === 'en' ? (item.schedule.titleEn || item.schedule.titleAr) : item.schedule.titleAr}
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.status === 'overdue'
                                  ? 'bg-rose-500 text-white'
                                  : item.status === 'due_soon'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {item.status === 'overdue' ? t('alerts_status_overdue') : item.status === 'due_soon' ? t('alerts_status_due_soon') : t('alerts_status_ok')}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mb-2">
                            {lang === 'en' ? item.schedule.titleAr : item.schedule.titleEn}
                          </div>
                          <div className="space-y-1 mb-3 text-xs">
                            <div>{t('alerts_interval')} <span className="font-semibold text-slate-200 font-mono">{item.schedule.intervalKm.toLocaleString()} {t('unit_km')}</span></div>
                            <div>{t('alerts_last_done')} <span className="font-semibold text-slate-200 font-mono">{item.schedule.lastDoneOdometer?.toLocaleString() || 0} {t('unit_km')}</span></div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 font-medium">
                          {lang === 'en'
                            ? (item.status === 'overdue'
                                ? `Overdue by ${Math.abs(item.remainingKm || 0).toLocaleString()} km!`
                                : item.status === 'due_soon'
                                ? `Due soon (${item.remainingKm?.toLocaleString()} km remaining)`
                                : `Good condition (${item.remainingKm?.toLocaleString()} km remaining)`)
                            : item.alertMessageAr}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual & Factory Specs Tab */}
              {activeTab === 'manual' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-amber-500" /> {t('manual_title')}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t('manual_desc')} {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year})
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={manualLoading}
                      onClick={handleFetchManual}
                      className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-3.5 py-1.5 rounded text-xs flex items-center gap-1.5 transition shrink-0"
                    >
                      {manualLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('manual_loading')}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          {selectedVehicle.specs ? t('manual_btn_refresh') : t('manual_btn_fetch')}
                        </>
                      )}
                    </button>
                  </div>

                  {manualError && (
                    <div className="bg-rose-950/40 border border-rose-900/60 p-3 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{manualError}</span>
                    </div>
                  )}

                  {manualLoading && (
                    <div className="bg-slate-950 border border-slate-800 p-8 rounded-xl text-center space-y-3">
                      <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
                      <div className="text-xs font-semibold text-slate-200">
                        {t('manual_loading')}
                      </div>
                      <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                        {t('manual_loading_sub')}
                      </p>
                    </div>
                  )}

                  {!manualLoading && selectedVehicle.specs && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Engine Oil Specs */}
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-amber-400 font-semibold text-xs">
                            <Wrench className="w-4 h-4" /> {t('manual_card_engine_oil')}
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">{t('manual_field_oil_viscosity')}</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.engineOilViscosity || t('manual_not_specified')}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">{t('manual_field_oil_capacity')}</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.engineOilCapacityLiters || t('manual_not_specified')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Transmission & Coolant */}
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-amber-400 font-semibold text-xs">
                            <Gauge className="w-4 h-4" /> {t('manual_card_fluids')}
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">{t('manual_field_trans_fluid')}</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.transmissionFluidType || t('manual_not_specified')}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">{t('manual_field_coolant')}</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.coolantType || t('manual_not_specified')}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">{t('manual_field_brake_fluid')}</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.brakeFluidType || t('manual_not_specified')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Tire Pressure */}
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-amber-400 font-semibold text-xs">
                            <Gauge className="w-4 h-4" /> {t('manual_card_tire_pressure')}
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">{t('manual_field_tire_front')}</span>
                              <span className="font-bold text-emerald-400 font-mono">{selectedVehicle.specs.tirePressurePsiFront || t('manual_not_specified')}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">{t('manual_field_tire_rear')}</span>
                              <span className="font-bold text-emerald-400 font-mono">{selectedVehicle.specs.tirePressurePsiRear || t('manual_not_specified')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Fuel System */}
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-amber-400 font-semibold text-xs">
                            <Fuel className="w-4 h-4" /> {t('manual_card_fuel_ignition')}
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">{t('manual_field_tank_capacity')}</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.fuelTankCapacityLiters || t('manual_not_specified')}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">{t('manual_field_octane')}</span>
                              <span className="font-bold text-amber-300">{selectedVehicle.specs.recommendedFuelOctane || t('manual_not_specified')}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">{t('manual_field_spark_plugs')}</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.sparkPlugType || t('manual_not_specified')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Battery & Electrical */}
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-amber-400 font-semibold text-xs">
                            <ShieldCheck className="w-4 h-4" /> {t('manual_card_battery')}
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">{t('manual_field_battery')}</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.batterySpec || t('manual_not_specified')}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* General OEM Notes */}
                      {selectedVehicle.specs.generalNotesAr && (
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-2">
                          <div className="text-amber-400 font-semibold text-xs flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {t('manual_card_oem_tips')}
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                            {selectedVehicle.specs.generalNotesAr}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {!manualLoading && !selectedVehicle.specs && (
                    <div className="max-w-md mx-auto my-12 text-center bg-slate-950 p-8 rounded-xl border border-slate-800 space-y-4">
                      <BookOpen className="w-12 h-12 text-amber-500 mx-auto" />
                      <div>
                        <h3 className="text-sm font-bold text-slate-100">{t('manual_empty_title')}</h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {t('manual_empty_desc')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleFetchManual}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs inline-flex items-center gap-2 transition"
                      >
                        <Sparkles className="w-4 h-4" /> {t('manual_empty_btn')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* AI Car Doctor Consultation Tab */}
              {activeTab === 'doctor' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-amber-500" /> {t('doc_title')}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t('doc_desc')}
                      </p>
                    </div>
                    <div className="text-xs bg-slate-950 border border-slate-800 px-3 py-1.5 rounded text-slate-300 font-mono">
                      {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year}) • {t('header_odometer')} <span className="text-amber-400 font-bold">{selectedVehicle.currentOdometer.toLocaleString()} {t('unit_km')}</span>
                    </div>
                  </div>

                  {/* Consultation Input Box */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <form onSubmit={handleAskDoctor} className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          {t('doc_input_label')}
                        </label>
                        <textarea
                          required
                          rows={3}
                          value={doctorQuery}
                          onChange={e => setDoctorQuery(e.target.value)}
                          placeholder={t('doc_input_placeholder')}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 outline-none focus:border-amber-500 leading-relaxed resize-none"
                        />
                      </div>

                      {/* Quick Suggestions */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="font-medium text-slate-400">{t('doc_quick_title')}</span>
                        {[
                          t('doc_quick_1'),
                          t('doc_quick_2'),
                          t('doc_quick_3'),
                          t('doc_quick_4'),
                        ].map((suggestion, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setDoctorQuery(suggestion)}
                            className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-2.5 py-1 rounded-full transition"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="submit"
                          disabled={doctorLoading || !doctorQuery.trim()}
                          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded text-xs flex items-center gap-2 transition"
                        >
                          {doctorLoading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('doc_btn_loading')}
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" /> {t('doc_btn_submit')}
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Consultation History */}
                  <div className="space-y-4">
                    {doctorHistory.length === 0 ? (
                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-6 text-center space-y-2">
                        <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto" />
                        <h4 className="text-xs font-semibold text-slate-300">{t('doc_welcome_title')}</h4>
                        <p className="text-[11px] text-slate-400 max-w-lg mx-auto leading-relaxed">
                          {t('doc_welcome_desc')}
                        </p>
                      </div>
                    ) : (
                      doctorHistory.map((item, idx) => (
                        <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                          {/* User Query */}
                          <div className="flex items-start gap-2.5 bg-slate-900/70 p-3 rounded-lg border border-slate-800/70">
                            <span className="text-amber-400 font-bold text-xs shrink-0">{t('doc_your_query')}</span>
                            <span className="text-xs text-slate-200 leading-relaxed">{item.query}</span>
                          </div>

                          {/* Doctor Advice */}
                          <div className="space-y-2 pr-1">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                              <Wrench className="w-3.5 h-3.5" /> {t('doc_advice_title')}
                            </div>
                            <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-slate-900/40 p-4 rounded-lg border border-slate-800/50">
                              {item.advice}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Printable Buyer & Inspection Report Tab */}
              {activeTab === 'report' && (
                <div className="space-y-6">
                  {/* Action Bar (Hidden on Print) */}
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-900/50 p-4 rounded-lg border border-slate-800 print:hidden">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-500" />
                        {t('rep_title')}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">{t('rep_desc')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => exportVehicleDossierToExcel(selectedVehicle, maintenanceLogs, fuelLogs, lang)}
                        className="bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-500/50 px-3.5 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> {t('rep_btn_excel')}
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                      >
                        <Printer className="w-3.5 h-3.5" /> {t('rep_btn_print')}
                      </button>
                    </div>
                  </div>

                  {/* Certified Printable Dossier Container */}
                  <div className="printable-document bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-6">
                    {/* Official Document Header */}
                    <div className="border-b-2 border-slate-800 pb-5 flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-extrabold tracking-wider text-amber-500 print:text-amber-800 uppercase">
                            CarBook Dossier
                          </span>
                          <span className="text-[10px] bg-amber-500/10 text-amber-400 print:bg-slate-100 print:text-slate-800 px-2 py-0.5 rounded font-mono font-bold">
                            CB-{(selectedVehicle.id || '2026').slice(0, 8).toUpperCase()}
                          </span>
                        </div>
                        <h1 className="text-lg font-bold text-slate-100 print:text-slate-950">{t('rep_heading')}</h1>
                        <p className="text-xs text-slate-400 print:text-slate-600">
                          {t('rep_date')} {new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                      </div>
                      <div className={`space-y-1 ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>
                        <div className="text-base font-bold text-slate-100 print:text-slate-950">
                          {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year})
                        </div>
                        <div className="text-xs text-amber-400 print:text-amber-800 font-mono font-bold">
                          {t('header_plate')} {selectedVehicle.licensePlate || t('header_no_plate')}
                        </div>
                        <div className="text-[11px] text-slate-400 print:text-slate-600">
                          {selectedVehicle.name}
                        </div>
                      </div>
                    </div>

                    {/* Executive Summary Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                      <div className="print-card-accent bg-slate-900 p-3 rounded border border-slate-800">
                        <div className="text-[11px] text-slate-400 print:text-slate-600">{t('rep_summary_odometer')}</div>
                        <div className="text-base font-bold text-amber-400 print:text-amber-900 font-mono mt-0.5">
                          {selectedVehicle.currentOdometer.toLocaleString()} {t('unit_km')}
                        </div>
                      </div>
                      <div className="print-card-subtle bg-slate-900 p-3 rounded border border-slate-800">
                        <div className="text-[11px] text-slate-400 print:text-slate-600">{t('rep_summary_oil')}</div>
                        <div className="text-sm font-bold text-slate-200 print:text-slate-900 mt-1">
                          {selectedVehicle.recommendedOil || t('manual_not_specified')}
                        </div>
                      </div>
                      <div className="print-card-subtle bg-slate-900 p-3 rounded border border-slate-800">
                        <div className="text-[11px] text-slate-400 print:text-slate-600">{t('rep_summary_total_maint')}</div>
                        <div className="text-base font-bold text-emerald-400 print:text-emerald-900 font-mono mt-0.5">
                          {maintenanceLogs.length}
                        </div>
                      </div>
                      <div className="print-card-subtle bg-slate-900 p-3 rounded border border-slate-800">
                        <div className="text-[11px] text-slate-400 print:text-slate-600">
                          {lang === 'ar' ? 'إجمالي تكاليف الصيانة' : 'Total Service Costs'}
                        </div>
                        <div className="text-base font-bold text-slate-200 print:text-slate-900 font-mono mt-0.5">
                          {maintenanceLogs.reduce((acc, m) => acc + (Number(m.totalCost) || 0), 0).toLocaleString()} {t('unit_currency')}
                        </div>
                      </div>
                    </div>

                    {/* Technical & OEM Specifications Box */}
                    <div className="print-card-subtle bg-slate-900/60 p-4 rounded-lg border border-slate-800 space-y-2">
                      <h3 className="text-xs font-bold text-slate-300 print:text-slate-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                        {lang === 'ar' ? 'المواصفات الفنية وسوائل المحرك المعتمدة' : 'OEM Technical & Fluid Specifications'}
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                        <div className="flex justify-between border-b border-slate-800 print:border-slate-300 py-1">
                          <span className="text-slate-400 print:text-slate-600">{lang === 'ar' ? 'سائل التبريد:' : 'Coolant:'}</span>
                          <span className="font-semibold text-slate-200 print:text-slate-900">{selectedVehicle.coolantSpec || '—'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 print:border-slate-300 py-1">
                          <span className="text-slate-400 print:text-slate-600">{lang === 'ar' ? 'زيت القير:' : 'Trans Fluid:'}</span>
                          <span className="font-semibold text-slate-200 print:text-slate-900">{selectedVehicle.transmissionSpec || '—'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 print:border-slate-300 py-1">
                          <span className="text-slate-400 print:text-slate-600">{lang === 'ar' ? 'ضغط الإطارات:' : 'Tire Pressure:'}</span>
                          <span className="font-semibold text-slate-200 print:text-slate-900">{selectedVehicle.tirePressureSpec || '—'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 print:border-slate-300 py-1">
                          <span className="text-slate-400 print:text-slate-600">{lang === 'ar' ? 'سعة الخزان:' : 'Tank Capacity:'}</span>
                          <span className="font-semibold text-slate-200 print:text-slate-900">{selectedVehicle.fuelTankCapacity ? `${selectedVehicle.fuelTankCapacity} L` : '—'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 print:border-slate-300 py-1">
                          <span className="text-slate-400 print:text-slate-600">{lang === 'ar' ? 'شمعات الاحتراق:' : 'Spark Plugs:'}</span>
                          <span className="font-semibold text-slate-200 print:text-slate-900">{selectedVehicle.sparkPlugsSpec || '—'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 print:border-slate-300 py-1">
                          <span className="text-slate-400 print:text-slate-600">{lang === 'ar' ? 'مواصفة البطارية:' : 'Battery:'}</span>
                          <span className="font-semibold text-slate-200 print:text-slate-900">{selectedVehicle.batterySpec || '—'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Maintenance Log Table in Report */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-slate-300 print:text-slate-900 flex items-center justify-between">
                        <span>{t('rep_table_title')}</span>
                        <span className="text-[11px] font-normal text-slate-400 print:text-slate-600">
                          {maintenanceLogs.length} {lang === 'ar' ? 'عملية مسجلة' : 'records logged'}
                        </span>
                      </h3>
                      <div className="border border-slate-800 print:border-slate-300 rounded overflow-hidden">
                        <table className="w-full text-start text-xs">
                          <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 print:bg-slate-100 print:text-slate-900">
                            <tr>
                              <th className="p-2 text-start">{t('rep_th_date')}</th>
                              <th className="p-2 text-start">{t('rep_th_odometer')}</th>
                              <th className="p-2 text-start">{t('rep_th_service')}</th>
                              <th className="p-2 text-start">{t('rep_th_workshop')}</th>
                              <th className="p-2 text-start">{t('rep_th_cost')}</th>
                              <th className="p-2 text-start">{t('rep_th_notes')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 print:divide-slate-200">
                            {maintenanceLogs.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="p-4 text-center text-slate-500 italic">
                                  {lang === 'ar' ? 'لا توجد سجلات صيانة مسجلة حتى الآن' : 'No maintenance records logged yet'}
                                </td>
                              </tr>
                            ) : (
                              maintenanceLogs.map((m, idx) => {
                                let parts: Array<{ name: string; condition?: string; cost: number }> = [];
                                if (m.partsBreakdown) {
                                  try {
                                    parts = typeof m.partsBreakdown === 'string' ? JSON.parse(m.partsBreakdown) : m.partsBreakdown;
                                  } catch {}
                                }
                                return (
                                  <tr key={idx}>
                                    <td className="p-2 font-mono whitespace-nowrap">{m.serviceDate}</td>
                                    <td className="p-2 font-mono whitespace-nowrap">{m.odometer?.toLocaleString()} {t('unit_km')}</td>
                                    <td className="p-2">
                                      <div className="font-semibold text-slate-200 print:text-slate-950">{m.title}</div>
                                      {Array.isArray(parts) && parts.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {parts.map((p, pIdx) => (
                                            <span
                                              key={pIdx}
                                              className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-slate-900 print:bg-slate-100 border border-slate-800 print:border-slate-300 text-slate-300 print:text-slate-800"
                                            >
                                              {p.name} ({p.condition === 'used_import' ? (lang === 'ar' ? 'استيراد' : 'Used') : (lang === 'ar' ? 'جديد' : 'New')}: {p.cost} {t('unit_currency')})
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-2">{m.workshop || '—'}</td>
                                    <td className="p-2 font-mono font-bold whitespace-nowrap">{m.totalCost} {t('unit_currency')}</td>
                                    <td className="p-2 text-slate-400 print:text-slate-600">{m.notes || '—'}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Signatures & Seal Verification Block */}
                    <div className="signature-block grid grid-cols-2 gap-8 pt-4 border-t border-slate-800 print:border-slate-400">
                      <div className="space-y-6">
                        <div className="text-xs font-semibold text-slate-400 print:text-slate-700">
                          {t('rep_sig_owner')}
                        </div>
                        <div className="border-b border-dashed border-slate-700 print:border-slate-400 h-8"></div>
                      </div>
                      <div className="space-y-6">
                        <div className="text-xs font-semibold text-slate-400 print:text-slate-700">
                          {t('rep_sig_inspector')}
                        </div>
                        <div className="border-b border-dashed border-slate-700 print:border-slate-400 h-8"></div>
                      </div>
                    </div>

                    {/* Official Certification Footnote */}
                    <div className="text-center pt-2 text-[10px] text-slate-500 print:text-slate-600">
                      {t('rep_official_seal')} • CarBook Engine
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Language Selection Card */}
              <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Globe className="w-5 h-5 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-100">
                    {lang === 'ar' ? 'لغة التطبيق (App Language)' : 'App Language'}
                  </h2>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {lang === 'ar'
                    ? 'يدعم CarBook نظام اللغات المتعددة عبر ملفات .cfg البسيطة. يمكنك التبديل بين اللغات أو إضافة لغة جديدة بسهولة.'
                    : 'CarBook supports multiple languages configured via simple .cfg files. Switch your language or easily drop new language files.'}
                </p>
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  {languages.map(l => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setLang(l.code)}
                      className={`p-3 rounded-lg border text-xs font-bold flex items-center justify-between transition ${
                        lang === l.code
                          ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span>{l.name}</span>
                      {lang === l.code && <Check className="w-4 h-4 text-amber-400" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fuel Types & Pricing Settings */}
              <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Fuel className="w-5 h-5 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-100">{t('set_fuel_pricing_title')}</h2>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('set_fuel_pricing_desc')}
                </p>

                <div className="space-y-3">
                  {settings.fuelTypes?.map((ft, idx) => (
                    <div key={ft.id || idx} className="flex items-center gap-3 bg-slate-900/60 p-2.5 rounded border border-slate-800">
                      <input
                        type="text"
                        placeholder="Gasoline 95 / بنزين 95"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                        value={ft.name}
                        onChange={e => {
                          const updated = [...settings.fuelTypes];
                          updated[idx].name = e.target.value;
                          setSettings({ ...settings, fuelTypes: updated });
                        }}
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="Price"
                          className="w-24 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-amber-500 text-center"
                          value={ft.price}
                          onChange={e => {
                            const updated = [...settings.fuelTypes];
                            updated[idx].price = Number(e.target.value);
                            setSettings({ ...settings, fuelTypes: updated });
                          }}
                        />
                        <span className="text-xs text-slate-400">{t('unit_currency')}/{t('unit_liter')}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = settings.fuelTypes.filter((_, i) => i !== idx);
                          setSettings({ ...settings, fuelTypes: updated });
                        }}
                        className="text-rose-400 hover:text-rose-300 p-1 hover:bg-slate-800 rounded"
                        title={t('btn_delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      const newId = `fuel_${Date.now()}`;
                      setSettings({
                        ...settings,
                        fuelTypes: [...settings.fuelTypes, { id: newId, name: lang === 'en' ? 'New Fuel Grade' : 'نوع وقود جديد', price: 15.00 }],
                      });
                    }}
                    className="text-xs text-amber-500 hover:text-amber-400 font-medium flex items-center gap-1 py-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> {t('set_fuel_add_btn')}
                  </button>
                </div>
              </div>

              {/* AI Provider Settings */}
              <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Settings className="w-5 h-5 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-100">{t('set_ai_title')}</h2>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('set_ai_desc')}
                </p>

                {settingsMsg && (
                  <div className="p-2 text-xs bg-emerald-950 border border-emerald-800 text-emerald-300 rounded">
                    {t('set_save_success')}
                  </div>
                )}

                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">{t('set_ai_provider')}</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                      value={settings.provider}
                      onChange={e => setSettings(prev => ({ ...prev, provider: e.target.value }))}
                    >
                      <option value="gemini">Google Gemini API</option>
                      <option value="openrouter">OpenRouter API</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {t('set_ai_key_label')} {settings.hasApiKey && <span className="text-emerald-400">({t('set_ai_key_saved')} {settings.maskedApiKey})</span>}
                    </label>
                    <input
                      type="password"
                      placeholder={settings.hasApiKey ? t('set_ai_key_placeholder') : 'sk-or-v1-... or AIzaSy...'}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                      value={settings.apiKey}
                      onChange={e => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                    />
                  </div>

                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs transition"
                  >
                    {t('set_save_btn')}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add Vehicle Modal */}
      {showAddVehicleModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <Car className="w-4 h-4 text-amber-500" /> {t('modal_car_add_title')}
              </h3>
              <button onClick={() => setShowAddVehicleModal(false)} className="text-slate-400 hover:text-slate-200 text-xs">
                {t('btn_cancel')}
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">{t('modal_car_name_label')}</label>
                <input
                  required
                  type="text"
                  placeholder={t('modal_car_name_placeholder')}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  value={vehicleForm.name}
                  onChange={e => setVehicleForm({ ...vehicleForm, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{t('modal_car_make')}</label>
                  <input
                    required
                    type="text"
                    placeholder="Toyota / Hyundai"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={vehicleForm.make}
                    onChange={e => setVehicleForm({ ...vehicleForm, make: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{t('modal_car_model')}</label>
                  <input
                    required
                    type="text"
                    placeholder="Corolla / Tucson"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={vehicleForm.model}
                    onChange={e => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{t('modal_car_year')}</label>
                  <input
                    required
                    type="number"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={vehicleForm.year}
                    onChange={e => setVehicleForm({ ...vehicleForm, year: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{t('modal_car_plate')}</label>
                  <input
                    type="text"
                    placeholder="123 ABC"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={vehicleForm.licensePlate}
                    onChange={e => setVehicleForm({ ...vehicleForm, licensePlate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">{t('modal_car_init_odo')}</label>
                <input
                  required
                  type="number"
                  min="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                  value={vehicleForm.initialOdometer}
                  onChange={e => setVehicleForm({ ...vehicleForm, initialOdometer: Number(e.target.value) })}
                />
              </div>

              {/* AI Auto-fetch Button */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> {t('modal_car_ai_box')}
                  </span>
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={handleAiLookup}
                    className="bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/40 px-2.5 py-1 rounded text-xs transition"
                  >
                    {aiLoading ? t('modal_car_ai_loading') : t('modal_car_ai_btn')}
                  </button>
                </div>

                {aiError && (
                  <div className="text-[11px] text-rose-400 bg-rose-950/30 p-2 rounded border border-rose-900/40">
                    {aiError}
                  </div>
                )}

                {aiProposal && (
                  <div className="text-xs space-y-2 bg-slate-950 p-2.5 rounded border border-slate-800">
                    <div className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {t('modal_car_ai_found')}
                    </div>
                    <div>{t('modal_car_ai_oil')} <span className="font-bold text-slate-100">{aiProposal.recommendedOil}</span></div>
                    <div className="text-[11px] text-slate-400">
                      {t('modal_car_ai_note')}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">{t('modal_car_oil_label')}</label>
                <input
                  type="text"
                  placeholder="5W-30 Full Synthetic"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  value={vehicleForm.recommendedOil}
                  onChange={e => setVehicleForm({ ...vehicleForm, recommendedOil: e.target.value })}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddVehicleModal(false)}
                  className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200"
                >
                  {t('btn_cancel')}
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-1.5 rounded text-xs transition"
                >
                  {t('modal_car_btn_save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fuel Log Modal */}
      {showFuelModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <Fuel className="w-4 h-4 text-amber-500" />
                {editingFuelId ? t('modal_fuel_edit_title') : t('modal_fuel_new_title')}
              </h3>
              <button onClick={() => setShowFuelModal(false)} className="text-slate-400 hover:text-slate-200 text-xs">
                {t('btn_cancel')}
              </button>
            </div>

            <form onSubmit={handleSaveFuel} className="space-y-3">
              {/* Fuel Type Dropdown Selector */}
              {settings.fuelTypes && settings.fuelTypes.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">{t('modal_fuel_type_label')}</label>
                  <select
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={selectedFuelType}
                    onChange={e => {
                      const typeId = e.target.value;
                      setSelectedFuelType(typeId);
                      const matched = settings.fuelTypes?.find(ft => ft.id === typeId);
                      if (matched) {
                        const price = matched.price;
                        const totalCost = fuelForm.liters > 0 ? Number((fuelForm.liters * price).toFixed(2)) : fuelForm.totalCost;
                        setFuelForm({
                          ...fuelForm,
                          pricePerLiter: price,
                          totalCost,
                          notes: matched.name,
                        });
                      }
                    }}
                  >
                    <option value="custom" disabled={Boolean(selectedFuelType && selectedFuelType !== 'custom')}>
                      {lang === 'en' ? 'Select fuel grade...' : 'اختر نوع الوقود...'}
                    </option>
                    {settings.fuelTypes.map(ft => (
                      <option key={ft.id} value={ft.id}>
                        {ft.name} — ({ft.price} {t('unit_currency')}/{t('unit_liter')})
                      </option>
                    ))}
                    <option value="custom">{lang === 'en' ? 'Custom price / other' : 'سعر مخصص / نوع آخر'}</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{t('fuel_th_date')}</label>
                  <input
                    required
                    type="date"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={fuelForm.fillDate}
                    onChange={e => setFuelForm({ ...fuelForm, fillDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{t('fuel_th_odometer')} ({t('unit_km')})</label>
                  <input
                    required
                    type="number"
                    min="0"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                    value={fuelForm.odometer}
                    onChange={e => setFuelForm({ ...fuelForm, odometer: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{t('modal_fuel_liters_label')}</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0"
                    placeholder="40.5"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                    value={fuelForm.liters || ''}
                    onChange={e => {
                      const val = e.target.value;
                      const liters = val === '' ? 0 : Number(val);
                      const price = fuelForm.pricePerLiter;
                      const totalCost = price > 0 && liters > 0 ? Number((liters * price).toFixed(2)) : fuelForm.totalCost;
                      setFuelForm({ ...fuelForm, liters, totalCost });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{t('modal_fuel_price_label')}</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0"
                    placeholder="15.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                    value={fuelForm.pricePerLiter || ''}
                    onChange={e => {
                      const val = e.target.value;
                      const price = val === '' ? 0 : Number(val);
                      let newTotal = fuelForm.totalCost;
                      if (price > 0 && fuelForm.liters > 0) {
                        newTotal = Number((fuelForm.liters * price).toFixed(2));
                      }
                      setFuelForm({ ...fuelForm, pricePerLiter: price, totalCost: newTotal });
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">{t('modal_fuel_total_label')}</label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0"
                  placeholder="600"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                  value={fuelForm.totalCost || ''}
                  onChange={e => {
                    const val = e.target.value;
                    const totalCost = val === '' ? 0 : Number(val);
                    const price = fuelForm.pricePerLiter;
                    const liters = price > 0 && totalCost > 0 ? Number((totalCost / price).toFixed(3)) : fuelForm.liters;
                    setFuelForm({ ...fuelForm, totalCost, liters });
                  }}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="fullTank"
                  checked={fuelForm.isFullTank}
                  onChange={e => setFuelForm({ ...fuelForm, isFullTank: e.target.checked })}
                />
                <label htmlFor="fullTank" className="text-xs text-slate-300">{t('modal_fuel_full_tank_checkbox')}</label>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">{t('modal_fuel_notes_label')}</label>
                <input
                  type="text"
                  placeholder="Gas station / Fuel note"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  value={fuelForm.notes}
                  onChange={e => setFuelForm({ ...fuelForm, notes: e.target.value })}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFuelModal(false)}
                  className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200"
                >
                  {t('btn_cancel')}
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-1.5 rounded text-xs transition"
                >
                  {editingFuelId ? t('modal_fuel_btn_update') : t('modal_fuel_btn_save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Maintenance Log Modal */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-950 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-500" />
                {editingMaintenanceId ? t('modal_maint_edit_title') : t('modal_maint_new_title')}
              </h3>
              <button onClick={() => setShowMaintenanceModal(false)} className="text-slate-400 hover:text-slate-200 text-xs">
                {t('btn_cancel')}
              </button>
            </div>

            <form onSubmit={handleSaveMaintenance} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_date')}</label>
                  <input
                    required
                    type="date"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={maintenanceForm.serviceDate}
                    onChange={e => setMaintenanceForm({ ...maintenanceForm, serviceDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_odo')}</label>
                  <input
                    required
                    type="number"
                    min="0"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                    value={maintenanceForm.odometer}
                    onChange={e => setMaintenanceForm({ ...maintenanceForm, odometer: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_title_label')}</label>
                <input
                  required
                  type="text"
                  placeholder={t('modal_maint_title_placeholder')}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  value={maintenanceForm.title}
                  onChange={e => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">{lang === 'en' ? 'Service Type' : 'نوع الخدمة'}</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  value={maintenanceForm.serviceType}
                  onChange={e => setMaintenanceForm({ ...maintenanceForm, serviceType: e.target.value })}
                >
                  <option value="oil_change">{lang === 'en' ? 'Oil & Filters Change' : 'تغيير زيت وفلاتر'}</option>
                  <option value="periodic">{lang === 'en' ? 'Periodic Maintenance' : 'صيانة دورية'}</option>
                  <option value="brakes">{lang === 'en' ? 'Brakes & Pads' : 'فرامل وتيل'}</option>
                  <option value="tires">{lang === 'en' ? 'Tires & Alignment' : 'إطارات وضبط زوايا'}</option>
                  <option value="repair">{lang === 'en' ? 'Mechanical Repair' : 'إصلاح عطل'}</option>
                  <option value="other">{lang === 'en' ? 'Other' : 'أخرى'}</option>
                </select>
              </div>

              {/* Parts Items List */}
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-200">{t('modal_maint_parts_box_title')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPartsList([
                        ...partsList,
                        { id: `p_${Date.now()}`, name: '', condition: 'new', cost: 0 },
                      ]);
                    }}
                    className="text-xs text-amber-500 hover:text-amber-400 font-medium flex items-center gap-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> {t('modal_maint_add_part_btn')}
                  </button>
                </div>

                {partsList.length === 0 ? (
                  <div className="text-[11px] text-slate-400 text-center py-2 border border-dashed border-slate-800 rounded">
                    {lang === 'en'
                      ? 'No spare parts added yet. Click "Add Spare Part" to detail components (New or OEM Import).'
                      : 'لم تتم إضافة قطع غيار بعد. اضغط "إضافة قطعة غيار" لتفصيل القطع (جديدة أو استيراد).'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {partsList.map((part, idx) => (
                      <div key={part.id || idx} className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded border border-slate-800">
                        {/* Part Name */}
                        <div className="col-span-5">
                          <input
                            required
                            type="text"
                            placeholder={t('modal_maint_part_name')}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                            value={part.name}
                            onChange={e => {
                              const updated = [...partsList];
                              updated[idx].name = e.target.value;
                              setPartsList(updated);
                            }}
                          />
                        </div>

                        {/* Condition (New vs Used Import) */}
                        <div className="col-span-3">
                          <select
                            className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                            value={part.condition}
                            onChange={e => {
                              const updated = [...partsList];
                              updated[idx].condition = e.target.value as 'new' | 'used_import';
                              setPartsList(updated);
                            }}
                          >
                            <option value="new">{t('maint_cond_new')}</option>
                            <option value="used_import">{t('maint_cond_used')}</option>
                          </select>
                        </div>

                        {/* Part Cost */}
                        <div className="col-span-3">
                          <div className="flex items-center gap-1">
                            <input
                              required
                              type="number"
                              step="any"
                              min="0"
                              placeholder={t('modal_maint_part_price')}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 font-mono outline-none focus:border-amber-500 text-center"
                              value={part.cost || ''}
                              onChange={e => {
                                const val = e.target.value;
                                const cost = val === '' ? 0 : Number(val);
                                const updated = [...partsList];
                                updated[idx].cost = cost;
                                setPartsList(updated);

                                const totalParts = updated.reduce((s, p) => s + (Number(p.cost) || 0), 0);
                                setMaintenanceForm(prev => ({
                                  ...prev,
                                  partsCost: totalParts,
                                  totalCost: totalParts + Number(prev.laborCost),
                                }));
                              }}
                            />
                            <span className="text-[11px] text-slate-400">{t('unit_currency')}</span>
                          </div>
                        </div>

                        {/* Delete Button */}
                        <div className="col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = partsList.filter((_, i) => i !== idx);
                              setPartsList(updated);
                              const totalParts = updated.reduce((s, p) => s + (Number(p.cost) || 0), 0);
                              setMaintenanceForm(prev => ({
                                ...prev,
                                partsCost: totalParts,
                                totalCost: totalParts + Number(prev.laborCost),
                              }));
                            }}
                            className="text-rose-400 hover:text-rose-300 p-1 hover:bg-slate-800 rounded"
                            title={t('btn_delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cost Summary Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {t('modal_maint_parts_total_label')} {partsList.length > 0 && <span className="text-amber-400 font-mono">({partsList.length})</span>}
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    readOnly={partsList.length > 0}
                    className={`w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono ${
                      partsList.length > 0 ? 'bg-slate-900/40 text-amber-300 font-bold cursor-not-allowed' : ''
                    }`}
                    value={maintenanceForm.partsCost || ''}
                    onChange={e => {
                      const parts = Number(e.target.value) || 0;
                      setMaintenanceForm({ ...maintenanceForm, partsCost: parts, totalCost: parts + maintenanceForm.laborCost });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_labor_label')}</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                    value={maintenanceForm.laborCost || ''}
                    onChange={e => {
                      const val = e.target.value;
                      const labor = val === '' ? 0 : Number(val);
                      const parts = partsList.length > 0
                        ? partsList.reduce((s, p) => s + (Number(p.cost) || 0), 0)
                        : maintenanceForm.partsCost;
                      setMaintenanceForm({ ...maintenanceForm, laborCost: labor, totalCost: parts + labor });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1 font-bold">{t('modal_maint_total_label')}</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-amber-400 outline-none focus:border-amber-500 font-bold font-mono"
                    value={maintenanceForm.totalCost || ''}
                    onChange={e => setMaintenanceForm({ ...maintenanceForm, totalCost: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_workshop')}</label>
                <input
                  type="text"
                  placeholder="Official Service Center / Garage"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  value={maintenanceForm.workshop}
                  onChange={e => setMaintenanceForm({ ...maintenanceForm, workshop: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_next_odo')}</label>
                <input
                  type="number"
                  placeholder="e.g. 60000"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                  value={maintenanceForm.nextDueOdometer || ''}
                  onChange={e => setMaintenanceForm({ ...maintenanceForm, nextDueOdometer: Number(e.target.value) })}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMaintenanceModal(false)}
                  className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200"
                >
                  {t('btn_cancel')}
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-1.5 rounded text-xs transition"
                >
                  {editingMaintenanceId ? t('modal_maint_btn_update') : t('modal_maint_btn_save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
