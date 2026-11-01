import React, { useState, useRef, useEffect } from 'react';
import { AlertTriangle, Fuel, Wrench, Pencil, Trash2, Car, MoreVertical, Plus } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { formatDate } from '@/i18n/util';

export interface OverviewTabProps {
  selectedVehicle: any;
  reportData: any | null;
  schedules: any[];
  fuelLogs: any[];
  maintenanceLogs: any[];
  onSelectTab: (tab: any) => void;
  onEditVehicle?: (vehicle: any) => void;
  onDeleteVehicle?: (vehicle: any) => void;
  onOpenAddVehicle?: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  selectedVehicle,
  reportData,
  schedules,
  fuelLogs,
  maintenanceLogs,
  onSelectTab,
  onEditVehicle,
  onDeleteVehicle,
  onOpenAddVehicle,
}) => {
  const { t, dir, lang } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Sort schedules by urgency: Overdue first, Due Soon second, OK last
  const prioritizedSchedules = [...schedules].sort((a, b) => {
    const score = (s: any) => (s.status === 'overdue' ? 2 : s.status === 'due_soon' ? 1 : 0);
    return score(b) - score(a);
  });

  return (
    <div className="space-y-6">
      {/* Vehicle Info & Action Header */}
      <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl relative">
        <div className="flex items-start gap-3 pe-12">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0 mt-0.5">
            <Car className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-100 truncate">{selectedVehicle.name}</h2>
              <span className="text-xs text-slate-400 font-medium">
                ({selectedVehicle.make} {selectedVehicle.model} - {selectedVehicle.year})
              </span>
              {selectedVehicle.engineCc && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  {selectedVehicle.engineCc}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-3 mt-1.5 flex-wrap">
              {selectedVehicle.licensePlate && (
                <span>{t('modal_car_plate')}: <strong className="text-slate-300 font-mono">{selectedVehicle.licensePlate}</strong></span>
              )}
              {selectedVehicle.recommendedOil && (
                <span>{t('modal_car_oil_label')}: <strong className="text-amber-400/90">{selectedVehicle.recommendedOil}</strong></span>
              )}
            </div>
          </div>
        </div>

        {/* 3-dots Menu for Vehicle Actions - Firmly pinned in the top-end corner */}
        {(onOpenAddVehicle || onEditVehicle || onDeleteVehicle) && (
          <div className="absolute top-3.5 end-3.5 z-20" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label={t('vehicle_actions_aria')}
              className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-amber-400 border border-slate-800 hover:border-slate-700 transition active:scale-95 shadow-sm"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMenuOpen && (
              <div
                className={`absolute top-full mt-1.5 w-48 bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl z-30 py-1.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 ${
                  dir === 'rtl' ? 'left-0' : 'right-0'
                }`}
              >
                {onOpenAddVehicle && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenAddVehicle();
                    }}
                    className="w-full text-start px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/80 hover:text-amber-400 flex items-center gap-2.5 transition"
                  >
                    <Plus className="w-4 h-4 text-emerald-400" />
                    <span>{t('action_add_vehicle') || 'إضافة سيارة أخرى'}</span>
                  </button>
                )}

                {onEditVehicle && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onEditVehicle(selectedVehicle);
                    }}
                    className="w-full text-start px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/80 hover:text-amber-400 flex items-center gap-2.5 transition"
                  >
                    <Pencil className="w-4 h-4 text-amber-400" />
                    <span>{t('btn_edit_vehicle')}</span>
                  </button>
                )}

                {onDeleteVehicle && (
                  <>
                    <div className="my-1 border-t border-slate-800" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onDeleteVehicle(selectedVehicle);
                      }}
                      className="w-full text-start px-3.5 py-2 text-xs font-medium text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-2.5 transition"
                    >
                      <Trash2 className="w-4 h-4 text-rose-400" />
                      <span>{t('btn_delete_vehicle')}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
          <div className="text-xs text-slate-400 mb-1">{t('ov_current_odometer')}</div>
          <div className="text-xl font-bold text-amber-400 font-mono">
            {selectedVehicle.currentOdometer.toLocaleString()}{' '}
            <span className="text-xs font-normal text-slate-400">{t('unit_km')}</span>
          </div>
        </div>
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
          <div className="text-xs text-slate-400 mb-1">{t('ov_avg_consumption')}</div>
          <div className="text-xl font-bold text-emerald-400 font-mono">
            {reportData?.summary?.averageLitersPer100Km
              ? `${reportData.summary.averageLitersPer100Km} ${t('unit_l_per_100km')}`
              : t('ov_calculating')}
          </div>
        </div>
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
          <div className="text-xs text-slate-400 mb-1">{t('ov_total_fuel_cost')}</div>
          <div className="text-xl font-bold text-slate-100 font-mono">
            {reportData?.summary?.totalFuelCost?.toLocaleString() || 0}{' '}
            <span className="text-xs font-normal text-slate-400">{t('unit_currency')}</span>
          </div>
        </div>
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
          <div className="text-xs text-slate-400 mb-1">{t('ov_total_maint_cost')}</div>
          <div className="text-xl font-bold text-slate-100 font-mono">
            {reportData?.summary?.totalMaintenanceCost?.toLocaleString() || 0}{' '}
            <span className="text-xs font-normal text-slate-400">{t('unit_currency')}</span>
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
          <button onClick={() => onSelectTab('alerts')} className="text-xs text-amber-400 hover:underline">
            {t('ov_view_all')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {prioritizedSchedules.slice(0, 4).map((s, idx) => (
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
                <div className="font-semibold">
                  {lang !== 'ar' ? s.schedule.titleEn || s.schedule.titleAr : s.schedule.titleAr}
                </div>
                <div className="text-[11px] opacity-80">
                  {lang !== 'ar'
                    ? s.status === 'overdue'
                      ? t('alerts_overdue_by', { km: Math.abs(s.remainingKm || 0).toLocaleString() })
                      : s.status === 'due_soon'
                      ? t('alerts_due_soon_remaining', { km: s.remainingKm?.toLocaleString() ?? 0 })
                      : t('alerts_good_remaining', { km: s.remainingKm?.toLocaleString() ?? 0 })
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
                {s.status === 'overdue'
                  ? t('alerts_status_overdue')
                  : s.status === 'due_soon'
                  ? t('alerts_status_due_soon')
                  : t('alerts_status_ok')}
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
            <button onClick={() => onSelectTab('fuel')} className="text-xs text-amber-400 hover:underline">
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
                    <div className="font-medium text-slate-200 font-mono">
                      {formatDate(f.fillDate, lang)} — {f.odometer.toLocaleString()} {t('unit_km')}
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      {f.liters} {t('unit_liter')} ({f.pricePerLiter} {t('unit_currency')}/{t('unit_liter')})
                      {f.litersPer100Km && (
                        <span className="text-emerald-400 mx-2 font-mono">
                          • {f.litersPer100Km} {t('unit_l_per_100km')} ({f.costPerKm} {t('unit_currency')}/{t('unit_km')})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="font-bold text-amber-400 font-mono">
                    {f.totalCost} {t('unit_currency')}
                  </div>
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
            <button onClick={() => onSelectTab('maintenance')} className="text-xs text-amber-400 hover:underline">
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
                    <div className="text-slate-400 text-[11px] font-mono">
                      {formatDate(m.serviceDate, lang)} — {m.odometer.toLocaleString()} {t('unit_km')}
                    </div>
                  </div>
                  <div className="font-bold text-slate-200 font-mono">
                    {m.totalCost} {t('unit_currency')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
