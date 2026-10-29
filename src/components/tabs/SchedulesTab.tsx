import React from 'react';
import { useTranslation } from '@/i18n/context';

export interface SchedulesTabProps {
  schedules: any[];
}

export const SchedulesTab: React.FC<SchedulesTabProps> = ({ schedules }) => {
  const { t, lang } = useTranslation();

  return (
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
                  {lang === 'en' ? item.schedule.titleEn || item.schedule.titleAr : item.schedule.titleAr}
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
                  {item.status === 'overdue'
                    ? t('alerts_status_overdue')
                    : item.status === 'due_soon'
                    ? t('alerts_status_due_soon')
                    : t('alerts_status_ok')}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mb-2">
                {lang === 'en' ? item.schedule.titleAr : item.schedule.titleEn}
              </div>
              <div className="space-y-1 mb-3 text-xs">
                <div>
                  {t('alerts_interval')}{' '}
                  <span className="font-semibold text-slate-200 font-mono">
                    {item.schedule.intervalKm.toLocaleString()} {t('unit_km')}
                  </span>
                </div>
                <div>
                  {t('alerts_last_done')}{' '}
                  <span className="font-semibold text-slate-200 font-mono">
                    {item.schedule.lastDoneOdometer?.toLocaleString() || 0} {t('unit_km')}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 font-medium">
              {lang === 'en'
                ? item.status === 'overdue'
                  ? `Overdue by ${Math.abs(item.remainingKm || 0).toLocaleString()} km!`
                  : item.status === 'due_soon'
                  ? `Due soon (${item.remainingKm?.toLocaleString()} km remaining)`
                  : `Good condition (${item.remainingKm?.toLocaleString()} km remaining)`
                : item.alertMessageAr}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
