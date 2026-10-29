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
  ShieldCheck
} from 'lucide-react';

export default function WorkbenchPage() {
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
    if (!confirm('هل أنت متأكد من حذف هذه التفويلة؟')) return;
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
    if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
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
      {/* Sidebar / Left Navigation */}
      <aside className="w-64 bg-slate-950 border-l border-slate-800 flex flex-col justify-between">
        <div>
          {/* App Branding */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Car className="text-amber-500 w-6 h-6" />
              <div>
                <h1 className="font-bold text-sm tracking-wide">Car Followup</h1>
                <p className="text-xs text-slate-400">متابعة صيانة وبنزين السيارات</p>
              </div>
            </div>
          </div>

          {/* Vehicle Selector */}
          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase">السيارة الحالية</span>
              <button
                onClick={() => setShowAddVehicleModal(true)}
                className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1 font-medium"
              >
                <PlusCircle className="w-3.5 h-3.5" /> إضافة
              </button>
            </div>
            {vehicles.length === 0 ? (
              <div className="text-xs text-slate-500 p-2 text-center bg-slate-900 rounded border border-dashed border-slate-800">
                لا توجد سيارات بعد
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
                activeTab === 'overview' ? 'bg-amber-500/10 text-amber-500 border-r-2 border-amber-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Gauge className="w-4 h-4" /> لوحة التحكم العامة
            </button>
            <button
              onClick={() => setActiveTab('fuel')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'fuel' ? 'bg-amber-500/10 text-amber-500 border-r-2 border-amber-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Fuel className="w-4 h-4" /> سجل التفويل واستهلاك البنزين
            </button>
            <button
              onClick={() => setActiveTab('maintenance')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'maintenance' ? 'bg-amber-500/10 text-amber-500 border-r-2 border-amber-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Wrench className="w-4 h-4" /> سجل الصيانات وتغيير الزيت
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'alerts' ? 'bg-amber-500/10 text-amber-500 border-r-2 border-amber-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4" /> جدول الصيانة والتنبيهات
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'manual' ? 'bg-amber-500/10 text-amber-500 border-r-2 border-amber-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-4 h-4" /> كتالوج ومواصفات السيارة
            </button>
            <button
              onClick={() => setActiveTab('doctor')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'doctor' ? 'bg-amber-500/10 text-amber-500 border-r-2 border-amber-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <HelpCircle className="w-4 h-4" /> استشارة مهندس الصيانة (AI)
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === 'report' ? 'bg-amber-500/10 text-amber-500 border-r-2 border-amber-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" /> تقرير الفحص والبيع
            </button>
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-slate-800">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition ${
              activeTab === 'settings' ? 'bg-amber-500/10 text-amber-500' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" /> إعدادات النظام وذكاء AI
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Top Header */}
        <header className="h-14 border-b border-slate-800 bg-slate-950/60 px-6 flex items-center justify-between">
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
                <div className="text-xs text-slate-400 flex items-center gap-1 border-r border-slate-800 pr-3 mr-3">
                  <span>العداد الحالي:</span>
                  <span className="font-bold text-amber-400">{selectedVehicle.currentOdometer.toLocaleString()} كم</span>
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-400">يرجى إضافة أو اختيار سيارة للبدء</span>
            )}
          </div>

          {selectedVehicle && (
            <div className="flex items-center gap-2">
              <button
                onClick={openAddFuelModal}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition"
              >
                <Fuel className="w-3.5 h-3.5" /> تسجيل تفويلة
              </button>
              <button
                onClick={openAddMaintenanceModal}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 border border-slate-700 transition"
              >
                <Wrench className="w-3.5 h-3.5" /> تسجيل صيانة / زيت
              </button>
            </div>
          )}
        </header>

        {/* Tab Body */}
        <div className="p-6">
          {!selectedVehicle && activeTab !== 'settings' ? (
            <div className="max-w-md mx-auto my-20 text-center bg-slate-950 p-8 rounded-xl border border-slate-800">
              <Car className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-base font-semibold mb-2">مرحباً بك في برنامج متابعة السيارة</h2>
              <p className="text-xs text-slate-400 mb-6">
                ابدأ بإضافة سيارتك لمتابعة استهلاك الوقود وجدول الصيانات والتنبيهات الدورية لقراءة العداد Odometer.
              </p>
              <button
                onClick={() => setShowAddVehicleModal(true)}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs inline-flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" /> إضافة سيارتك الآن
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
                      <div className="text-xs text-slate-400 mb-1">العداد الحالي</div>
                      <div className="text-xl font-bold text-amber-400">
                        {selectedVehicle.currentOdometer.toLocaleString()} <span className="text-xs font-normal text-slate-400">كم</span>
                      </div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">متوسط استهلاك الوقود</div>
                      <div className="text-xl font-bold text-emerald-400">
                        {reportData?.summary?.averageLitersPer100Km ? `${reportData.summary.averageLitersPer100Km} لتر/100كم` : 'تحت الحساب'}
                      </div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">إجمالي مصاريف البنزين</div>
                      <div className="text-xl font-bold text-slate-100">
                        {reportData?.summary?.totalFuelCost?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-400">جنيه</span>
                      </div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">إجمالي مصاريف الصيانة</div>
                      <div className="text-xl font-bold text-slate-100">
                        {reportData?.summary?.totalMaintenanceCost?.toLocaleString() || 0} <span className="text-xs font-normal text-slate-400">جنيه</span>
                      </div>
                    </div>
                  </div>

                  {/* Urgent Alerts Preview */}
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <h3 className="font-semibold text-xs text-slate-200">حالة الصيانات الدورية القادمة</h3>
                      </div>
                      <button onClick={() => setActiveTab('alerts')} className="text-xs text-amber-400 hover:underline">
                        عرض الكل
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
                            <div className="font-semibold">{s.schedule.titleAr}</div>
                            <div className="text-[11px] opacity-80">{s.alertMessageAr}</div>
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
                            {s.status === 'overdue' ? 'متأخر' : s.status === 'due_soon' ? 'قريب' : 'جيد'}
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
                          <Fuel className="w-3.5 h-3.5 text-amber-400" /> أحدث تفويلات البنزين
                        </h3>
                        <button onClick={() => setActiveTab('fuel')} className="text-xs text-amber-400 hover:underline">
                          عرض السجل
                        </button>
                      </div>
                      <div className="space-y-2">
                        {fuelLogs.slice(0, 3).map((f, idx) => (
                          <div key={idx} className="bg-slate-900 p-2.5 rounded text-xs flex justify-between items-center">
                            <div>
                              <div className="font-medium text-slate-200">{f.fillDate} — {f.odometer.toLocaleString()} كم</div>
                              <div className="text-slate-400 text-[11px]">
                                {f.liters} لتر ({f.pricePerLiter} ج/لتر)
                                {f.litersPer100Km && (
                                  <span className="text-emerald-400 mr-2">
                                    • {f.litersPer100Km} لتر/100كم ({f.costPerKm} ج/كم)
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="font-bold text-amber-400">{f.totalCost} ج</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recent Maintenance */}
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-xs text-slate-200 flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-amber-400" /> أحدث الصيانات
                        </h3>
                        <button onClick={() => setActiveTab('maintenance')} className="text-xs text-amber-400 hover:underline">
                          عرض السجل
                        </button>
                      </div>
                      <div className="space-y-2">
                        {maintenanceLogs.slice(0, 3).map((m, idx) => (
                          <div key={idx} className="bg-slate-900 p-2.5 rounded text-xs flex justify-between items-center">
                            <div>
                              <div className="font-medium text-slate-200">{m.title}</div>
                              <div className="text-slate-400 text-[11px]">{m.serviceDate} — {m.odometer.toLocaleString()} كم</div>
                            </div>
                            <div className="font-bold text-slate-200">{m.totalCost} ج</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Fuel Logs Tab */}
              {activeTab === 'fuel' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-sm font-semibold text-slate-200">سجل استهلاك وتفويلات البنزين</h2>
                    <button
                      onClick={openAddFuelModal}
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> إضافة تفويلة جديدة
                    </button>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">العداد Odometer</th>
                          <th className="p-3">المسافة المقطوعة</th>
                          <th className="p-3">كمية الوقود</th>
                          <th className="p-3">سعر اللتر</th>
                          <th className="p-3">التكلفة الإجمالية</th>
                          <th className="p-3">معدل الاستهلاك</th>
                          <th className="p-3">تكلفة الكيلومتر</th>
                          <th className="p-3">نوع التفويلة</th>
                          <th className="p-3">ملاحظات</th>
                          <th className="p-3 text-center">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {fuelLogs.map((log, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/50">
                            <td className="p-3">{log.fillDate}</td>
                            <td className="p-3 font-semibold text-amber-400">{log.odometer.toLocaleString()} كم</td>
                            <td className="p-3 text-slate-300">
                              {log.distanceTraveledKm ? (
                                <span className="font-mono">+{log.distanceTraveledKm.toLocaleString()} كم</span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="p-3">{log.liters} لتر</td>
                            <td className="p-3">{log.pricePerLiter} ج</td>
                            <td className="p-3 font-bold">{log.totalCost} ج</td>
                            <td className="p-3">
                              {log.litersPer100Km ? (
                                <span className="bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded font-mono font-bold">
                                  {log.litersPer100Km} L/100km
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[11px]">— (أول تفويلة)</span>
                              )}
                            </td>
                            <td className="p-3">
                              {log.costPerKm ? (
                                <span className="bg-amber-950/60 text-amber-300 border border-amber-800/50 px-2 py-0.5 rounded font-mono font-bold">
                                  {log.costPerKm} ج/كم
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] ${log.isFullTank ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                                {log.isFullTank ? 'تفويلة كاملة' : 'جزئية'}
                              </span>
                            </td>
                            <td className="p-3 text-slate-400">{log.notes || '—'}</td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => openEditFuelModal(log)}
                                  className="text-amber-400 hover:text-amber-300 p-1 rounded hover:bg-slate-800 transition"
                                  title="تعديل التفويلة"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteFuel(log.id)}
                                  className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-slate-800 transition"
                                  title="حذف التفويلة"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Maintenance Logs Tab */}
              {activeTab === 'maintenance' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-sm font-semibold text-slate-200">سجل الصيانات الدورية وقطع الغيار</h2>
                    <button
                      onClick={openAddMaintenanceModal}
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> إضافة صيانة جديدة
                    </button>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">العداد</th>
                          <th className="p-3">بيان الصيانة</th>
                          <th className="p-3">نوع الصيانة</th>
                          <th className="p-3">قطع الغيار</th>
                          <th className="p-3">المصنعية</th>
                          <th className="p-3">الإجمالي</th>
                          <th className="p-3">الورشة / المركز</th>
                          <th className="p-3">الصيانة القادمة</th>
                          <th className="p-3 text-center">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {maintenanceLogs.map((log, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/50">
                            <td className="p-3">{log.serviceDate}</td>
                            <td className="p-3 font-semibold text-amber-400">{log.odometer.toLocaleString()} كم</td>
                            <td className="p-3 font-medium text-slate-100">
                              <div>{log.title}</div>
                              {log.partsList && log.partsList.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {log.partsList.map((p: any, pIdx: number) => (
                                    <span key={pIdx} className="text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">
                                      {p.name} ({p.condition === 'new' ? 'جديد' : 'استيراد'} - {p.cost} ج)
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-3">
                              <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                                {log.serviceType}
                              </span>
                            </td>
                            <td className="p-3">{log.partsCost} ج</td>
                            <td className="p-3">{log.laborCost} ج</td>
                            <td className="p-3 font-bold text-amber-400">{log.totalCost} ج</td>
                            <td className="p-3 text-slate-400">{log.workshop || '—'}</td>
                            <td className="p-3 text-slate-400">
                              {log.nextDueOdometer ? `${log.nextDueOdometer.toLocaleString()} كم` : '—'}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => openEditMaintenanceModal(log)}
                                  className="text-amber-400 hover:text-amber-300 p-1 rounded hover:bg-slate-800 transition"
                                  title="تعديل الصيانة"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteMaintenance(log.id)}
                                  className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-slate-800 transition"
                                  title="حذف الصيانة"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Maintenance Schedule & Alerts Tab */}
              {activeTab === 'alerts' && (
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-slate-200">جدول الصيانات المبرمجة وتنبيهات العداد</h2>
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
                            <h3 className="font-bold text-sm text-slate-100">{item.schedule.titleAr}</h3>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.status === 'overdue'
                                  ? 'bg-rose-500 text-white'
                                  : item.status === 'due_soon'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {item.status === 'overdue' ? 'تجاوزت الموعد' : item.status === 'due_soon' ? 'اقترب الموعد' : 'حالة ممتازة'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mb-2">{item.schedule.titleEn}</div>
                          <div className="space-y-1 mb-3 text-xs">
                            <div>الفاصل الدوري: <span className="font-semibold text-slate-200">{item.schedule.intervalKm.toLocaleString()} كم</span></div>
                            <div>آخر إجراء تم عند عداد: <span className="font-semibold text-slate-200">{item.schedule.lastDoneOdometer?.toLocaleString() || 0} كم</span></div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 font-medium">
                          {item.alertMessageAr}
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
                        <BookOpen className="w-4 h-4 text-amber-500" /> كتالوج ومواصفات المصنع الأصلية (OEM Specs)
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        المواصفات الفنية المعتمدة للزيوت، السوائل، ضغوط الإطارات، ونوع الوقود حسب توصية الصانع لـ {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year})
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
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري جلب المواصفات...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          {selectedVehicle.specs ? 'تحديث المواصفات بالذكاء الاصطناعي' : 'استخراج كتالوج السيارة بالذكاء الاصطناعي'}
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
                        جاري فحص واستخراج كتالوج المصنع المعتمد لـ {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.year}...
                      </div>
                      <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                        يقوم الذكاء الاصطناعي بمراجعة مواصفات لزوجة زيت المحرك، سعة التانك، نوع زيت الفتيس، سائل التبريد، وضغوط الإطارات لحفظها محلياً في قاعدة البيانات.
                      </p>
                    </div>
                  )}

                  {!manualLoading && selectedVehicle.specs && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Engine Oil Specs */}
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-amber-400 font-semibold text-xs">
                            <Wrench className="w-4 h-4" /> زيت المحرك والسعة
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">اللزوجة والمواصفة المعتمدة:</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.engineOilViscosity || 'غير محدد'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">سعة الزيت (مع تغيير الفلتر):</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.engineOilCapacityLiters || 'غير محدد'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Transmission & Coolant */}
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-amber-400 font-semibold text-xs">
                            <Gauge className="w-4 h-4" /> سوائل الحركة والتبريد
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">زيت ناقل الحركة (الفتيس/الجير):</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.transmissionFluidType || 'غير محدد'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">سائل التبريد (مياه الردياتير):</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.coolantType || 'غير محدد'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">سائل الفرامل (Brake Fluid):</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.brakeFluidType || 'غير محدد'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Tire Pressure */}
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-amber-400 font-semibold text-xs">
                            <Gauge className="w-4 h-4" /> ضغط هواء الإطارات (بارد)
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">ضغط العجلات الأمامية:</span>
                              <span className="font-bold text-emerald-400 font-mono">{selectedVehicle.specs.tirePressurePsiFront || 'غير محدد'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">ضغط العجلات الخلفية:</span>
                              <span className="font-bold text-emerald-400 font-mono">{selectedVehicle.specs.tirePressurePsiRear || 'غير محدد'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Fuel System */}
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-amber-400 font-semibold text-xs">
                            <Fuel className="w-4 h-4" /> منظومة الوقود والاشتعال
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">سعة خزان الوقود (التانك):</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.fuelTankCapacityLiters || 'غير محدد'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">نوع وأوكتان البنزين الموصى به:</span>
                              <span className="font-bold text-amber-300">{selectedVehicle.specs.recommendedFuelOctane || 'غير محدد'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">شمعات الاشتعال (البوجيهات):</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.sparkPlugType || 'غير محدد'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Battery & Electrical */}
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-amber-400 font-semibold text-xs">
                            <ShieldCheck className="w-4 h-4" /> البطارية والنظام الكهربائي
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">مواصفة البطارية المعتمدة:</span>
                              <span className="font-bold text-slate-100">{selectedVehicle.specs.batterySpec || 'غير محدد'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* General OEM Notes */}
                      {selectedVehicle.specs.generalNotesAr && (
                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-2">
                          <div className="text-amber-400 font-semibold text-xs flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> إرشادات وتوصيات الشركة الصانعة
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
                        <h3 className="text-sm font-bold text-slate-100">لم يتم استخراج كتالوج ومواصفات السيارة بعد</h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          استخدم الذكاء الاصطناعي لجلب لزوجة زيت المحرك، سعة التانك، نوع زيت الفتيس، مياه الردياتير، وضغط الإطارات المناسب لسيارتك {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year}) وحفظها محلياً للمراجعة في أي وقت بدون إنترنت.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleFetchManual}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs inline-flex items-center gap-2 transition"
                      >
                        <Sparkles className="w-4 h-4" /> جلب كتالوج ومواصفات المصنع الآن
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
                        <HelpCircle className="w-4 h-4 text-amber-500" /> استشارة مهندس الصيانة المساعد (AI Car Doctor)
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        استشر مهندس الصيانة حول أي عطل، أصوات غريبة، رموز أعطال OBD-II، أو مواعيد الصيانة الوقائية بناءً على تاريخ سيارتك
                      </p>
                    </div>
                    <div className="text-xs bg-slate-950 border border-slate-800 px-3 py-1.5 rounded text-slate-300 font-mono">
                      {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year}) • العداد: <span className="text-amber-400 font-bold">{selectedVehicle.currentOdometer.toLocaleString()} كم</span>
                    </div>
                  </div>

                  {/* Consultation Input Box */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <form onSubmit={handleAskDoctor} className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1.5">
                          اكتب سؤالك أو صف المشكلة والأعراض أو كود العطل:
                        </label>
                        <textarea
                          required
                          rows={3}
                          value={doctorQuery}
                          onChange={e => setDoctorQuery(e.target.value)}
                          placeholder="مثال: أسمع صوت طقطقة مع الملفات لليمين على سرعة بطيئة، أو ما سبب إضاءة لمبة المحرك مع كود P0420؟ أو متى يجب تغيير سير الكاتينة لسيارتي؟"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 outline-none focus:border-amber-500 leading-relaxed resize-none"
                        />
                      </div>

                      {/* Quick Suggestions */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="font-medium text-slate-400">أسئلة سريعة:</span>
                        {[
                          'صوت طقطقة خفيف مع الملفات',
                          'اهتزاز أو رجة في الدركسيون مع الفرامل',
                          'ضعف عزم السيارة وتأخر التسارع',
                          'أفضل لزوجة زيت محرك في الصيف والحرارة العالية',
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
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري تحليل الأعراض والصيانات...
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" /> إرسال الاستشارة
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
                        <h4 className="text-xs font-semibold text-slate-300">كيف يساعدك مهندس الصيانة المساعد؟</h4>
                        <p className="text-[11px] text-slate-400 max-w-lg mx-auto leading-relaxed">
                          يقوم الذكاء الاصطناعي بربط استفسارك بقراءة عداد السيارة الحالية ({selectedVehicle.currentOdometer.toLocaleString()} كم)، وتاريخ الصيانات المسجلة، والمواصفات المصنعية ونقاط الضعف الشائعة لموديل سيارتك لتقديم تشخيص دقيق ومباشر.
                        </p>
                      </div>
                    ) : (
                      doctorHistory.map((item, idx) => (
                        <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                          {/* User Query */}
                          <div className="flex items-start gap-2.5 bg-slate-900/70 p-3 rounded-lg border border-slate-800/70">
                            <span className="text-amber-400 font-bold text-xs shrink-0">سؤالك:</span>
                            <span className="text-xs text-slate-200 leading-relaxed">{item.query}</span>
                          </div>

                          {/* Doctor Advice */}
                          <div className="space-y-2 pr-1">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                              <Wrench className="w-3.5 h-3.5" /> تشخيص وتوصية مهندس الصيانة:
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

              {/* Printable Buyer Report Tab */}
              {activeTab === 'report' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center print:hidden">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-200">تقرير الفحص وتاريخ صيانة السيارة (مخصص للمشتري والمالك)</h2>
                      <p className="text-xs text-slate-400">سجل شفاف معتمد لقراءة العداد وتاريخ الصيانات وقطع الغيار</p>
                    </div>
                    <button
                      onClick={() => window.print()}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 border border-slate-700"
                    >
                      <Printer className="w-3.5 h-3.5" /> طباعة / تصدير PDF
                    </button>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-6">
                    {/* Report Header */}
                    <div className="border-b border-slate-800 pb-4 flex justify-between items-center">
                      <div>
                        <h1 className="text-lg font-bold text-amber-500">تقرير الفحص والصيانة الدوري للسيارة</h1>
                        <p className="text-xs text-slate-400">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-bold">{selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year})</div>
                        <div className="text-xs text-amber-400 font-mono">لوحة: {selectedVehicle.licensePlate || 'بدون لوحة'}</div>
                      </div>
                    </div>

                    {/* Report Summary Cards */}
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="bg-slate-900 p-3 rounded border border-slate-800">
                        <div className="text-xs text-slate-400">قراءة العداد المثبتة</div>
                        <div className="text-base font-bold text-amber-400">{selectedVehicle.currentOdometer.toLocaleString()} كم</div>
                      </div>
                      <div className="bg-slate-900 p-3 rounded border border-slate-800">
                        <div className="text-xs text-slate-400">نوع الزيت الموصى به</div>
                        <div className="text-base font-bold text-slate-200">{selectedVehicle.recommendedOil || 'غير محدد'}</div>
                      </div>
                      <div className="bg-slate-900 p-3 rounded border border-slate-800">
                        <div className="text-xs text-slate-400">إجمالي عمليات الصيانة المثبتة</div>
                        <div className="text-base font-bold text-emerald-400">{maintenanceLogs.length} عملية</div>
                      </div>
                    </div>

                    {/* Maintenance Log Table in Report */}
                    <div>
                      <h3 className="text-xs font-semibold mb-2 text-slate-300">سجل الصيانة وتغيير الزيوت الموثق:</h3>
                      <div className="border border-slate-800 rounded overflow-hidden">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                            <tr>
                              <th className="p-2">التاريخ</th>
                              <th className="p-2">العداد</th>
                              <th className="p-2">الخدمة المنفذة</th>
                              <th className="p-2">الورشة / المركز</th>
                              <th className="p-2">التكلفة</th>
                              <th className="p-2">ملاحظات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {maintenanceLogs.map((m, idx) => (
                              <tr key={idx}>
                                <td className="p-2">{m.serviceDate}</td>
                                <td className="p-2 font-mono">{m.odometer.toLocaleString()} كم</td>
                                <td className="p-2 font-medium">{m.title}</td>
                                <td className="p-2">{m.workshop || '—'}</td>
                                <td className="p-2">{m.totalCost} ج</td>
                                <td className="p-2 text-slate-400">{m.notes || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Fuel Types & Pricing Settings */}
              <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Fuel className="w-5 h-5 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-100">أنواع وأسعار الوقود / البنزين</h2>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  قم بضبط أسعار أنواع الوقود الحالية ليتم استخدامها واقتراحها تلقائياً عند تسجيل التفويلات الجديدة. يمكنك تعديل سعر اللتر لكل نوع أو إضافة وحذف الأنواع.
                </p>

                <div className="space-y-3">
                  {settings.fuelTypes?.map((ft, idx) => (
                    <div key={ft.id || idx} className="flex items-center gap-3 bg-slate-900/60 p-2.5 rounded border border-slate-800">
                      <input
                        type="text"
                        placeholder="اسم الوقود (مثال: بنزين 95)"
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
                          placeholder="السعر"
                          className="w-24 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-amber-500 text-center"
                          value={ft.price}
                          onChange={e => {
                            const updated = [...settings.fuelTypes];
                            updated[idx].price = Number(e.target.value);
                            setSettings({ ...settings, fuelTypes: updated });
                          }}
                        />
                        <span className="text-xs text-slate-400">جنيه/لتر</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = settings.fuelTypes.filter((_, i) => i !== idx);
                          setSettings({ ...settings, fuelTypes: updated });
                        }}
                        className="text-rose-400 hover:text-rose-300 p-1 hover:bg-slate-800 rounded"
                        title="حذف هذا النوع"
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
                        fuelTypes: [...settings.fuelTypes, { id: newId, name: 'نوع وقود جديد', price: 15.00 }],
                      });
                    }}
                    className="text-xs text-amber-500 hover:text-amber-400 font-medium flex items-center gap-1 py-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> إضافة نوع وقود جديد
                  </button>
                </div>
              </div>

              {/* AI Provider Settings */}
              <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Settings className="w-5 h-5 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-100">إعدادات الذكاء الاصطناعي (AI Provider)</h2>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  يمكنك إدخال مفتاح API لـ Google Gemini أو OpenRouter لجلب التوصيات الخاصة بنوع الزيت وجدول الصيانات الدوري المناسب لموديل سيارتك تلقائياً. المفتاح محفوظ محلياً بأمان ولا يتم مشاركته أبداً.
                </p>

                {settingsMsg && (
                  <div className="p-2 text-xs bg-emerald-950 border border-emerald-800 text-emerald-300 rounded">
                    {settingsMsg}
                  </div>
                )}

                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">مزود الخدمة</label>
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
                      مفتاح الـ API {settings.hasApiKey && <span className="text-emerald-400">(تم حفظ المفتاح: {settings.maskedApiKey})</span>}
                    </label>
                    <input
                      type="password"
                      placeholder={settings.hasApiKey ? 'أدخل مفتاح جديد لتحديثه...' : 'sk-or-v1-... أو AIzaSy...'}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                      value={settings.apiKey}
                      onChange={e => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                    />
                  </div>

                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs transition"
                  >
                    حفظ الإعدادات
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
                <Car className="w-4 h-4 text-amber-500" /> إضافة سيارة جديدة
              </h3>
              <button onClick={() => setShowAddVehicleModal(false)} className="text-slate-400 hover:text-slate-200 text-xs">
                إلغاء
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">اسم تعريفي للسيارة (مثال: سيارتي اليومية / سيارة العائلة)</label>
                <input
                  required
                  type="text"
                  placeholder="سيارتي اليومية"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  value={vehicleForm.name}
                  onChange={e => setVehicleForm({ ...vehicleForm, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">الماركة (Make)</label>
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
                  <label className="block text-xs text-slate-300 mb-1">الموديل (Model)</label>
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
                  <label className="block text-xs text-slate-300 mb-1">سنة الصنع</label>
                  <input
                    required
                    type="number"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={vehicleForm.year}
                    onChange={e => setVehicleForm({ ...vehicleForm, year: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">رقم اللوحة (اختياري)</label>
                  <input
                    type="text"
                    placeholder="س ق ر 123"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={vehicleForm.licensePlate}
                    onChange={e => setVehicleForm({ ...vehicleForm, licensePlate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">قراءة العداد الابتدائية (كم)</label>
                <input
                  required
                  type="number"
                  min="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  value={vehicleForm.initialOdometer}
                  onChange={e => setVehicleForm({ ...vehicleForm, initialOdometer: Number(e.target.value) })}
                />
              </div>

              {/* AI Auto-fetch Button */}
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> اقتراح نوع الزيت وجدول الصيانة بالذكاء الاصطناعي
                  </span>
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={handleAiLookup}
                    className="bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/40 px-2.5 py-1 rounded text-xs transition"
                  >
                    {aiLoading ? 'جاري البحث...' : 'بحث واقتراح'}
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
                      <CheckCircle2 className="w-3.5 h-3.5" /> تم العثور على توصيات لموديل سيارتك
                    </div>
                    <div>الزيت المقترح: <span className="font-bold text-slate-100">{aiProposal.recommendedOil}</span></div>
                    <div className="text-[11px] text-slate-400">
                      سيتم تهيئة جدول الصيانة الدوري تلقائياً بناءً على مواصفات الموديل.
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">نوع الزيت الموصى به</label>
                <input
                  type="text"
                  placeholder="مثال: 5W-30 تخليقي بالكامل"
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
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-1.5 rounded text-xs transition"
                >
                  حفظ السيارة
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
                {editingFuelId ? 'تعديل تفويلة بنزين' : 'تسجيل تفويلة بنزين'}
              </h3>
              <button onClick={() => setShowFuelModal(false)} className="text-slate-400 hover:text-slate-200 text-xs">
                إلغاء
              </button>
            </div>

            <form onSubmit={handleSaveFuel} className="space-y-3">
              {/* Fuel Type Dropdown Selector */}
              {settings.fuelTypes && settings.fuelTypes.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">نوع الوقود (مسجل في الإعدادات)</label>
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
                      اختر نوع الوقود...
                    </option>
                    {settings.fuelTypes.map(ft => (
                      <option key={ft.id} value={ft.id}>
                        {ft.name} — ({ft.price} جنيه/لتر)
                      </option>
                    ))}
                    <option value="custom">سعر مخصص / نوع آخر</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">التاريخ</label>
                  <input
                    required
                    type="date"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={fuelForm.fillDate}
                    onChange={e => setFuelForm({ ...fuelForm, fillDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">قراءة العداد Odometer (كم)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={fuelForm.odometer}
                    onChange={e => setFuelForm({ ...fuelForm, odometer: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">كمية الوقود (لتر)</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0"
                    placeholder="مثال: 40.584"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
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
                  <label className="block text-xs text-slate-300 mb-1">سعر اللتر (جنيه)</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0"
                    placeholder="مثال: 22.25"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
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
                <label className="block text-xs text-slate-300 mb-1">إجمالي التكلفة / المبلغ المدفوع (جنيه)</label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0"
                  placeholder="مثال: 902.99"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
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
                <label htmlFor="fullTank" className="text-xs text-slate-300">تفويلة كاملة (لحساب استهلاك اللتر/100كم بدقة)</label>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">ملاحظات (اختياري)</label>
                <input
                  type="text"
                  placeholder="نوع البنزين 95 أو المحطة"
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
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-1.5 rounded text-xs transition"
                >
                  {editingFuelId ? 'تحديث التفويلة' : 'تسجيل التفويلة'}
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
                {editingMaintenanceId ? 'تعديل صيانة / تغيير زيت' : 'تسجيل صيانة / تغيير زيت'}
              </h3>
              <button onClick={() => setShowMaintenanceModal(false)} className="text-slate-400 hover:text-slate-200 text-xs">
                إلغاء
              </button>
            </div>

            <form onSubmit={handleSaveMaintenance} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">التاريخ</label>
                  <input
                    required
                    type="date"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={maintenanceForm.serviceDate}
                    onChange={e => setMaintenanceForm({ ...maintenanceForm, serviceDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">قراءة العداد (كم)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                    value={maintenanceForm.odometer}
                    onChange={e => setMaintenanceForm({ ...maintenanceForm, odometer: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">بيان الصيانة</label>
                <input
                  required
                  type="text"
                  placeholder="مثال: تغيير زيت المحرك 10,000 كم + فلتر الزيت الأصلي"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  value={maintenanceForm.title}
                  onChange={e => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">نوع الخدمة</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  value={maintenanceForm.serviceType}
                  onChange={e => setMaintenanceForm({ ...maintenanceForm, serviceType: e.target.value })}
                >
                  <option value="oil_change">تغيير زيت وفلاتر</option>
                  <option value="periodic">صيانة دورية</option>
                  <option value="brakes">فرامل وتيل</option>
                  <option value="tires">إطارات وضبط زوايا</option>
                  <option value="repair">إصلاح عطل</option>
                  <option value="other">أخرى</option>
                </select>
              </div>

              {/* Parts Items List */}
              <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-200">قطع الغيار المستخدمة</span>
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
                    <PlusCircle className="w-3.5 h-3.5" /> إضافة قطعة غيار
                  </button>
                </div>

                {partsList.length === 0 ? (
                  <div className="text-[11px] text-slate-400 text-center py-2 border border-dashed border-slate-800 rounded">
                    لم تتم إضافة قطع غيار بعد. اضغط "إضافة قطعة غيار" لتفصيل القطع (جديدة أو استيراد).
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
                            placeholder="اسم القطعة (مثال: فلتر زيت، تيل فرامل)"
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
                            <option value="new">جديدة</option>
                            <option value="used_import">استيراد</option>
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
                              placeholder="السعر"
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
                            <span className="text-[11px] text-slate-400">ج</span>
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
                            title="حذف القطعة"
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
                    إجمالي قطع الغيار {partsList.length > 0 && <span className="text-amber-400 font-mono">({partsList.length})</span>}
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
                  <label className="block text-xs text-slate-300 mb-1">المصنعية (جنيه)</label>
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
                  <label className="block text-xs text-slate-300 mb-1 font-bold">الإجمالي الكلي (جنيه)</label>
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
                <label className="block text-xs text-slate-300 mb-1">الورشة / المركز (اختياري)</label>
                <input
                  type="text"
                  placeholder="مركز الخدمة المعتمد"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  value={maintenanceForm.workshop}
                  onChange={e => setMaintenanceForm({ ...maintenanceForm, workshop: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">العداد المستهدف للصيانة القادمة (اختياري)</label>
                <input
                  type="number"
                  placeholder="مثال: 60000"
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
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
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-1.5 rounded text-xs transition"
                >
                  {editingMaintenanceId ? 'تحديث الصيانة' : 'حفظ الصيانة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
