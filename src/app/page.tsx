'use client';

import React, { useState, useEffect, lazy, Suspense, memo, useCallback } from 'react';
import { Car, PlusCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

// Layout Components
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileTopBar } from '@/components/layout/MobileTopBar';
import { DesktopHeader } from '@/components/layout/DesktopHeader';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { MobileFab } from '@/components/layout/MobileFab';

// Tab Components.
// OverviewTab is the landing tab, so it stays in the initial chunk. The other
// seven are code-split with React.lazy and load only when first opened — that
// keeps xlsx (pulled in by the Report/Maintenance/Fuel export tabs) off the cold
// WebView start, which matters on low-end Android. Each lazy() re-wraps the
// named export as default (what React.lazy expects) and memoizes it so a page
// re-render that does not change its props (e.g. typing in another tab's input)
// does not re-render the whole tab.
import { OverviewTab as OverviewTabInner } from '@/components/tabs/OverviewTab';
const OverviewTab = memo(OverviewTabInner);
const FuelTab = lazy(() => import('@/components/tabs/FuelTab').then((m) => ({ default: memo(m.FuelTab) })));
const MaintenanceTab = lazy(() => import('@/components/tabs/MaintenanceTab').then((m) => ({ default: memo(m.MaintenanceTab) })));
const SchedulesTab = lazy(() => import('@/components/tabs/SchedulesTab').then((m) => ({ default: memo(m.SchedulesTab) })));
const ManualTab = lazy(() => import('@/components/tabs/ManualTab').then((m) => ({ default: memo(m.ManualTab) })));
const DoctorTab = lazy(() => import('@/components/tabs/DoctorTab').then((m) => ({ default: memo(m.DoctorTab) })));
const ReportsTab = lazy(() => import('@/components/tabs/ReportsTab').then((m) => ({ default: memo(m.ReportsTab) })));
const SettingsTab = lazy(() => import('@/components/tabs/SettingsTab').then((m) => ({ default: memo(m.SettingsTab) })));

// Modal Components
import { AddVehicleModal } from '@/components/modals/AddVehicleModal';
import { FuelLogModal } from '@/components/modals/FuelLogModal';
import { MaintenanceLogModal } from '@/components/modals/MaintenanceLogModal';

// Shared UI primitives (in-app replacements for alert()/confirm())
import { ToastViewport } from '@/components/ui/Toast';
import { ConfirmDialogHost } from '@/components/ui/ConfirmDialog';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { UpdateBanner } from '@/components/ui/UpdateBanner';

// Domain hooks + pure models (A5)
import { useAuth } from '@/hooks/useAuth';
import { useVehicles } from '@/hooks/useVehicles';
import { useSettings } from '@/hooks/useSettings';
import { useDetails } from '@/hooks/useDetails';
import { useFuelLogs } from '@/hooks/useFuelLogs';
import { useMaintenanceLogs } from '@/hooks/useMaintenanceLogs';
import { useSchedules } from '@/hooks/useSchedules';
import { useDoctor } from '@/hooks/useDoctor';
import { useManual } from '@/hooks/useManual';
import {
  selectBodyMode,
  countUrgentSchedules,
  shouldShowUrgentBanner,
  minOdometerFor,
} from '@/hooks/workbenchModel';

type TabKey = 'overview' | 'fuel' | 'maintenance' | 'alerts' | 'manual' | 'doctor' | 'report' | 'settings';

/** Suspense fallback for the code-split tabs (A6): a quiet skeleton, no copy. */
function TabLoading() {
  return (
    <div className="p-6 space-y-3" role="status" aria-live="polite">
      <div className="h-6 w-40 rounded bg-slate-800/60 animate-pulse" />
      <div className="h-24 w-full rounded bg-slate-800/40 animate-pulse" />
      <div className="h-24 w-full rounded bg-slate-800/40 animate-pulse" />
    </div>
  );
}

export default function WorkbenchPage() {
  const { t, lang } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showFabMenu, setShowFabMenu] = useState(false);

  const auth = useAuth();
  const vehicles = useVehicles();
  const settings = useSettings();
  const details = useDetails({
    selectedVehicle: vehicles.selectedVehicle,
    lang,
    setSelectedVehicle: vehicles.setSelectedVehicle,
  });
  const fuel = useFuelLogs({
    selectedVehicle: vehicles.selectedVehicle,
    fuelLogs: details.fuelLogs,
    fuelTypes: settings.settings.fuelTypes,
    reloadDetails: details.loadVehicleDetails,
    reloadVehicles: vehicles.loadVehicles,
  });
  const maintenance = useMaintenanceLogs({
    selectedVehicle: vehicles.selectedVehicle,
    reloadDetails: details.loadVehicleDetails,
    reloadVehicles: vehicles.loadVehicles,
  });
  const schedules = useSchedules({
    schedules: details.schedules,
    vehicleId: vehicles.selectedVehicle?.id,
    reloadDetails: details.loadVehicleDetails,
  });
  const doctor = useDoctor({ selectedVehicle: vehicles.selectedVehicle, lang });
  const manual = useManual({
    selectedVehicle: vehicles.selectedVehicle,
    setSelectedVehicle: vehicles.setSelectedVehicle,
    reloadVehicles: vehicles.loadVehicles,
  });

  const selectedVehicle = vehicles.selectedVehicle;

  // Initial load: auth mounts itself (useAuth); vehicles + settings load here.
  useEffect(() => {
    vehicles.loadVehicles();
    settings.loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bundled APK: the account handoff finishes AFTER mount (the bearer arrives
  // via deep link), so re-ask /api/auth/me once the shell reports a sign-in.
  // The shell also re-pulls the account rows into the local DB before it fires
  // this event — reloading vehicles here is what makes signed-in data appear
  // without needing to log out.
  useEffect(() => {
    const onHandoff = (e: Event) => {
      if ((e as CustomEvent)?.detail?.kind === 'signedin') {
        auth.loadAuth();
        vehicles.loadVehicles();
      }
    };
    window.addEventListener('carbook:handoff', onHandoff);
    return () => window.removeEventListener('carbook:handoff', onHandoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload settings whenever the settings tab is opened.
  useEffect(() => {
    if (activeTab === 'settings') {
      settings.loadSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // A new/edited vehicle's odometer seeds the two log forms.
  useEffect(() => {
    if (selectedVehicle) {
      fuel.setFuelForm((prev) => ({ ...prev, odometer: selectedVehicle.currentOdometer }));
      maintenance.setMaintenanceForm((prev) => ({ ...prev, odometer: selectedVehicle.currentOdometer }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicle]);

  // The details fan-out is cleared when the list empties (last vehicle deleted),
  // exactly as loadVehicles used to do inline before the hooks split.
  useEffect(() => {
    if (vehicles.initialLoadDone && vehicles.vehicles.length === 0) {
      details.clearAll();
    }
  }, [vehicles.initialLoadDone, vehicles.vehicles.length, details.clearAll]);

  const onDataRestored = useCallback(() => {
    vehicles.loadVehicles();
    if (selectedVehicle) details.loadVehicleDetails(selectedVehicle.id, true);
  }, [vehicles.loadVehicles, selectedVehicle, details.loadVehicleDetails]);

  const urgentCount = countUrgentSchedules(details.schedules);
  const bodyMode = selectBodyMode({
    loading: vehicles.loading,
    initialLoadDone: vehicles.initialLoadDone,
    initialLoadError: vehicles.initialLoadError,
    vehicleCount: vehicles.vehicles.length,
    hasSelectedVehicle: Boolean(selectedVehicle),
    activeTab,
  });
  const showUrgentBanner = shouldShowUrgentBanner({
    hasSelectedVehicle: Boolean(selectedVehicle),
    urgentCount,
    activeTab,
  });

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900 text-slate-100">
      {/* Desktop & Tablet Sidebar */}
      <Sidebar
        vehicles={vehicles.vehicles}
        selectedVehicle={selectedVehicle}
        onSelectVehicle={vehicles.setSelectedVehicle}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAddVehicle={vehicles.openAddVehicleModal}
        onEditVehicle={vehicles.openEditVehicleModal}
        onDeleteVehicle={vehicles.handleDeleteVehicle}
        currentUser={auth.currentUser}
        onLoginGoogle={auth.handleLoginGoogle}
        onLogout={auth.handleLogout}
        urgentCount={urgentCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Mobile M3 Top App Bar */}
        <MobileTopBar
          vehicles={vehicles.vehicles}
          selectedVehicle={selectedVehicle}
          onSelectVehicle={vehicles.setSelectedVehicle}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          currentUser={auth.currentUser}
          onLoginGoogle={auth.handleLoginGoogle}
          onLogout={auth.handleLogout}
          urgentCount={urgentCount}
        />

        {/* Desktop Top Header */}
        <DesktopHeader
          selectedVehicle={selectedVehicle}
          onOpenAddFuel={fuel.openAddFuelModal}
          onOpenAddMaintenance={maintenance.openAddMaintenanceModal}
          currentUser={auth.currentUser}
          onLoginGoogle={auth.handleLoginGoogle}
          onLogout={auth.handleLogout}
          urgentCount={urgentCount}
          onSelectTab={setActiveTab}
        />

        {/* APK In-App Update Banner */}
        <UpdateBanner />

        {/* Tab Body */}
        <div className="p-4 md:p-6 pb-36 md:pb-6">
          {/* Urgent Maintenance Banner */}
          {showUrgentBanner && (
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

          {bodyMode === 'skeleton' ? (
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
          ) : bodyMode === 'loadError' ? (
            /* Initial fetch FAILURE: honest error panel with Retry — never the
               first-run "add your car" state, which invites duplicate vehicles. */
            <div className="max-w-md mx-auto my-20 text-center bg-slate-950 p-8 rounded-xl border border-rose-900/60">
              <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
              <h2 className="text-base font-semibold mb-2 text-rose-200">{t('load_error_title')}</h2>
              <p className="text-xs text-slate-400 mb-2">{t('load_error_desc')}</p>
              <p className="text-[11px] text-slate-500 font-mono mb-6 break-words">{vehicles.initialLoadError}</p>
              <button
                onClick={() => vehicles.loadVehicles()}
                disabled={vehicles.loading}
                className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded text-xs inline-flex items-center justify-center gap-2 transition"
              >
                {t('btn_retry')}
              </button>
            </div>
          ) : bodyMode === 'firstRun' ? (
            <div className="max-w-md mx-auto my-20 text-center bg-slate-950 p-8 rounded-xl border border-slate-800">
              <Car className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-base font-semibold mb-2">{t('app_welcome_title')}</h2>
              <p className="text-xs text-slate-400 mb-6">
                {t('app_welcome_desc')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={vehicles.openAddVehicleModal}
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs inline-flex items-center justify-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" /> {t('app_add_first_car')}
                </button>
                {!auth.currentUser && (
                  <button
                    onClick={auth.handleLoginGoogle}
                    className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-900 font-bold px-4 py-2 rounded text-xs inline-flex items-center justify-center gap-2 shadow-sm"
                  >
                    <GoogleIcon className="w-3.5 h-3.5" />
                    <span>{t('btn_login_google')}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <Suspense fallback={<TabLoading />}>
              {activeTab === 'overview' && (
                <OverviewTab
                  selectedVehicle={selectedVehicle}
                  reportData={details.reportData}
                  fuelLogs={details.fuelLogs}
                  maintenanceLogs={details.maintenanceLogs}
                  schedules={details.schedules}
                  onSelectTab={setActiveTab}
                  onEditVehicle={vehicles.openEditVehicleModal}
                  onDeleteVehicle={vehicles.handleDeleteVehicle}
                  onOpenAddVehicle={vehicles.openAddVehicleModal}
                />
              )}

              {activeTab === 'fuel' && (
                <FuelTab
                  selectedVehicle={selectedVehicle}
                  fuelLogs={details.fuelLogs}
                  onOpenAddFuel={fuel.openAddFuelModal}
                  onOpenEditFuel={fuel.openEditFuelModal}
                  onDeleteFuel={fuel.handleDeleteFuel}
                />
              )}

              {activeTab === 'maintenance' && (
                <MaintenanceTab
                  selectedVehicle={selectedVehicle}
                  maintenanceLogs={details.maintenanceLogs}
                  onOpenAddMaintenance={maintenance.openAddMaintenanceModal}
                  onOpenEditMaintenance={maintenance.openEditMaintenanceModal}
                  onDeleteMaintenance={maintenance.handleDeleteMaintenance}
                />
              )}

              {activeTab === 'alerts' && (
                <SchedulesTab
                  schedules={schedules.schedules}
                  currentOdometer={selectedVehicle?.currentOdometer || 0}
                  vehicleId={selectedVehicle?.id}
                  onRefresh={schedules.refresh}
                />
              )}

              {activeTab === 'manual' && (
                <ManualTab
                  selectedVehicle={selectedVehicle}
                  manualLoading={manual.manualLoading}
                  manualError={manual.manualError}
                  onFetchManual={manual.handleFetchManual}
                />
              )}

              {activeTab === 'doctor' && (
                <DoctorTab
                  selectedVehicle={selectedVehicle}
                  doctorQuery={doctor.doctorQuery}
                  setDoctorQuery={doctor.setDoctorQuery}
                  doctorLoading={doctor.doctorLoading}
                  doctorHistory={doctor.doctorHistory}
                  onAskDoctor={doctor.handleAskDoctor}
                />
              )}

              {activeTab === 'report' && (
                <ReportsTab
                  selectedVehicle={selectedVehicle}
                  reportData={details.reportData}
                  maintenanceLogs={details.maintenanceLogs}
                  fuelLogs={details.fuelLogs}
                  manualLoading={manual.manualLoading}
                  onFetchManual={manual.handleFetchManual}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsTab
                  settings={settings.settings}
                  setSettings={settings.setSettings}
                  settingsMsg={settings.settingsMsg}
                  settingsError={settings.settingsError}
                  onSaveSettings={settings.handleSaveSettings}
                  currentUser={auth.currentUser}
                  onLoginGoogle={auth.handleLoginGoogle}
                  onLogout={auth.handleLogout}
                  onDataRestored={onDataRestored}
                />
              )}
            </Suspense>
          )}
        </div>

        {/* Modals */}
        <AddVehicleModal
          isOpen={vehicles.showAddVehicleModal}
          isEdit={Boolean(vehicles.editingVehicleId)}
          onClose={() => vehicles.setShowAddVehicleModal(false)}
          vehicleForm={vehicles.vehicleForm}
          setVehicleForm={vehicles.setVehicleForm}
          aiLoading={vehicles.aiLoading}
          aiProposal={vehicles.aiProposal}
          aiError={vehicles.aiError}
          onAiLookup={vehicles.handleAiLookup}
          onSaveVehicle={vehicles.handleSaveVehicle}
          saving={vehicles.savingVehicle}
        />

        <FuelLogModal
          isOpen={fuel.showFuelModal}
          onClose={() => fuel.setShowFuelModal(false)}
          editingFuelId={fuel.editingFuelId}
          fuelForm={fuel.fuelForm}
          setFuelForm={fuel.setFuelForm}
          selectedFuelType={fuel.selectedFuelType}
          setSelectedFuelType={fuel.setSelectedFuelType}
          settings={settings.settings}
          onSaveFuel={fuel.handleSaveFuel}
          saving={fuel.savingFuel}
          minOdometer={minOdometerFor(fuel.editingFuelId, selectedVehicle)}
        />

        <MaintenanceLogModal
          isOpen={maintenance.showMaintenanceModal}
          onClose={() => maintenance.setShowMaintenanceModal(false)}
          editingMaintenanceId={maintenance.editingMaintenanceId}
          maintenanceForm={maintenance.maintenanceForm}
          setMaintenanceForm={maintenance.setMaintenanceForm}
          partsList={maintenance.partsList}
          setPartsList={maintenance.setPartsList}
          schedules={details.schedules}
          onSaveMaintenance={maintenance.handleSaveMaintenance}
          saving={maintenance.savingMaintenance}
          minOdometer={minOdometerFor(maintenance.editingMaintenanceId, selectedVehicle)}
        />

        {/* Mobile Material You Floating Action Button (FAB) */}
        <MobileFab
          selectedVehicle={selectedVehicle}
          showFabMenu={showFabMenu}
          setShowFabMenu={setShowFabMenu}
          onOpenAddFuel={fuel.openAddFuelModal}
          onOpenAddMaintenance={maintenance.openAddMaintenanceModal}
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
