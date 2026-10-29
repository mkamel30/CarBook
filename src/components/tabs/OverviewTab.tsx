import React from 'react';
import { AlertTriangle, Fuel, Wrench } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface OverviewTabProps {
  selectedVehicle: any;
  reportData: any | null;
  schedules: any[];
  fuelLogs: any[];
  maintenanceLogs: any[];
  onSelectTab: (tab: any) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  selectedVehicle,
  reportData,
  schedules,
  fuelLogs,
  maintenanceLogs,
  onSelectTab,
}) => {
  const { t, lang } = useTranslation();

  // Sort schedules by urgency: Overdue first, Due Soon second, OK last
  const prioritizedSchedules = [...schedules].sort((a, b) => {
    const score = (s: any) => (s.status === 'overdue' ? 2 : s.status === 'due_soon' ? 1 : 0);
    return score(b) - score(a);
  });

  return (
    <div className="space-y-6">
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
                  {lang === 'en' ? s.schedule.titleEn || s.schedule.titleAr : s.schedule.titleAr}
                </div>
                <div className="text-[11px] opacity-80">
                  {lang === 'en'
                    ? s.status === 'overdue'
                      ? `Overdue by ${Math.abs(s.remainingKm || 0).toLocaleString()} km`
                      : s.status === 'due_soon'
                      ? `Due soon (${s.remainingKm?.toLocaleString()} km remaining)`
                      : `Good condition (${s.remainingKm?.toLocaleString()} km remaining)`
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
                      {f.fillDate} — {f.odometer.toLocaleString()} {t('unit_km')}
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
                      {m.serviceDate} — {m.odometer.toLocaleString()} {t('unit_km')}
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
