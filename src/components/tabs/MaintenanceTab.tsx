import React from 'react';
import { PlusCircle, FileSpreadsheet, Edit2, Trash2 } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { exportMaintenanceToExcel } from '@/services/exportExcel';

export interface MaintenanceTabProps {
  selectedVehicle: any;
  maintenanceLogs: any[];
  onOpenAddMaintenance: () => void;
  onOpenEditMaintenance: (log: any) => void;
  onDeleteMaintenance: (id: string) => void;
}

export const MaintenanceTab: React.FC<MaintenanceTabProps> = ({
  selectedVehicle,
  maintenanceLogs,
  onOpenAddMaintenance,
  onOpenEditMaintenance,
  onDeleteMaintenance,
}) => {
  const { t, lang } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Tab Header (Responsive) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-100">{t('maint_title')}</h2>
            <span className="text-[11px] font-mono bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-bold">
              {maintenanceLogs.length}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{t('maint_desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportMaintenanceToExcel(selectedVehicle, maintenanceLogs, lang)}
            className="bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-500/50 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
            title={t('rep_btn_excel_maint')}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('rep_btn_excel_maint')}</span>
            <span className="sm:hidden">Excel</span>
          </button>
          <button
            onClick={onOpenAddMaintenance}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" /> {t('maint_btn_new')}
          </button>
        </div>
      </div>

      {/* Mobile View: Material You (M3) Service Cards Feed */}
      <div className="md:hidden space-y-3">
        {maintenanceLogs.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-xs text-slate-500">
            {t('maint_empty_state')}
          </div>
        ) : (
          maintenanceLogs.map((log, idx) => (
            <div
              key={idx}
              className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 space-y-3 shadow-sm active:border-slate-700 transition"
            >
              {/* Top: Date & Odometer Chip */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-mono">{log.serviceDate}</span>
                <span className="text-xs font-mono font-bold bg-amber-500/15 text-amber-400 px-2.5 py-0.5 rounded-full border border-amber-500/25">
                  {log.odometer?.toLocaleString()} {t('unit_km')}
                </span>
              </div>

              {/* Service Title */}
              <div className="text-sm font-bold text-slate-100 leading-snug">{log.title}</div>

              {/* Parts Breakdown Chips */}
              {log.partsList && log.partsList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {log.partsList.map((p: any, pIdx: number) => (
                    <span
                      key={pIdx}
                      className="text-[11px] bg-slate-800/90 px-2.5 py-1 rounded-xl border border-slate-700/80 text-slate-200 flex items-center gap-1.5"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                          p.condition === 'new'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {p.condition === 'new' ? t('maint_cond_new') : t('maint_cond_used')}
                      </span>
                      <span className="font-mono text-amber-400 font-bold">
                        {p.cost} {t('unit_currency')}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {/* Workshop or Notes if present */}
              {(log.workshop || log.notes) && (
                <div className="text-[11px] text-slate-400 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/70 flex items-center justify-between gap-2">
                  {log.workshop && <span className="font-medium text-slate-300">📍 {log.workshop}</span>}
                  {log.notes && <span className="text-slate-400 truncate text-[10px]">{log.notes}</span>}
                </div>
              )}

              {/* Bottom: Cost Summary & Actions */}
              <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-xs">
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[11px] text-slate-400">{t('maint_th_total')}:</span>
                    <span className="text-base font-bold font-mono text-amber-400">{log.totalCost}</span>
                    <span className="text-[10px] text-slate-400">{t('unit_currency')}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    ({log.partsCost} {t('maint_parts_count')} + {log.laborCost} {t('maint_labor')})
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onOpenEditMaintenance(log)}
                    className="p-2 rounded-full text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition"
                    title={t('btn_edit')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteMaintenance(log.id)}
                    className="p-2 rounded-full text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                    title={t('btn_delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop View: Full Grid Table with horizontal scroll */}
      <div className="hidden md:block bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto table-scrollbar shadow-inner">
        <table className="w-full min-w-[760px] text-start text-xs">
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
                  <td className="p-3 font-semibold text-amber-400 font-mono">
                    {log.odometer.toLocaleString()} {t('unit_km')}
                  </td>
                  <td className="p-3 font-medium text-slate-100">
                    <div>{log.title}</div>
                    {log.partsList && log.partsList.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {log.partsList.map((p: any, pIdx: number) => (
                          <span
                            key={pIdx}
                            className="text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300"
                          >
                            {p.name} ({p.condition === 'new' ? t('maint_cond_new') : t('maint_cond_used')} - {p.cost}{' '}
                            {t('unit_currency')})
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-slate-400 font-mono">
                    {log.partsCost} {t('unit_currency')} ({t('maint_parts_count')}) + {log.laborCost}{' '}
                    {t('unit_currency')} ({t('maint_labor')})
                  </td>
                  <td className="p-3 font-bold text-amber-400 font-mono">
                    {log.totalCost} {t('unit_currency')}
                  </td>
                  <td className="p-3 text-slate-400">{log.workshop || '—'}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onOpenEditMaintenance(log)}
                        className="text-amber-400 hover:text-amber-300 p-1 rounded hover:bg-slate-800 transition"
                        title={t('btn_edit')}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteMaintenance(log.id)}
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
  );
};
