import React from 'react';
import { PlusCircle, FileSpreadsheet, Edit2, Trash2 } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { exportFuelToExcel } from '@/services/exportExcel';

export interface FuelTabProps {
  selectedVehicle: any;
  fuelLogs: any[];
  onOpenAddFuel: () => void;
  onOpenEditFuel: (log: any) => void;
  onDeleteFuel: (id: string) => void;
}

export const FuelTab: React.FC<FuelTabProps> = ({
  selectedVehicle,
  fuelLogs,
  onOpenAddFuel,
  onOpenEditFuel,
  onDeleteFuel,
}) => {
  const { t, lang } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Tab Header (Responsive) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-100">{t('fuel_title')}</h2>
            <span className="text-[11px] font-mono bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-bold">
              {fuelLogs.length}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{t('fuel_desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportFuelToExcel(selectedVehicle, fuelLogs, lang)}
            className="bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-500/50 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
            title={t('rep_btn_excel_fuel')}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('rep_btn_excel_fuel')}</span>
            <span className="sm:hidden">Excel</span>
          </button>
          <button
            onClick={onOpenAddFuel}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" /> {t('fuel_btn_new')}
          </button>
        </div>
      </div>

      {/* Mobile View: Material You (M3) Cards Feed */}
      <div className="md:hidden space-y-3">
        {fuelLogs.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-xs text-slate-500">
            {t('fuel_empty_state')}
          </div>
        ) : (
          fuelLogs.map((log, idx) => (
            <div
              key={idx}
              className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 space-y-3 shadow-sm active:border-slate-700 transition"
            >
              {/* Top: Date & Odometer Chip */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-mono">{log.fillDate}</span>
                <span className="text-xs font-mono font-bold bg-amber-500/15 text-amber-400 px-2.5 py-0.5 rounded-full border border-amber-500/25">
                  {log.odometer?.toLocaleString()} {t('unit_km')}
                </span>
              </div>

              {/* Middle: Big Cost & Liters */}
              <div className="flex items-baseline justify-between border-b border-slate-800/80 pb-2.5">
                <div>
                  <span className="text-xl font-bold font-mono text-slate-100">{log.totalCost}</span>
                  <span className="text-xs text-slate-400 mx-1">{t('unit_currency')}</span>
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  <span className="font-semibold text-amber-400">{log.liters}</span> {t('unit_liter')} @{' '}
                  {log.pricePerLiter} {t('unit_currency')}
                </div>
              </div>

              {/* Bottom: Consumption Pill, Badge & Actions */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {log.litersPer100Km ? (
                    <span className="inline-flex items-center text-[11px] font-bold font-mono bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                      ⚡ {log.litersPer100Km} {t('unit_l_per_100km')}
                    </span>
                  ) : null}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      log.isFullTank
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {log.isFullTank ? t('fuel_full_badge') : t('fuel_partial_badge')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onOpenEditFuel(log)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition"
                    title={t('btn_edit')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteFuel(log.id)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
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
                  <td className="p-3 font-semibold text-amber-400 font-mono">
                    {log.odometer.toLocaleString()} {t('unit_km')}
                  </td>
                  <td className="p-3 font-mono">
                    {log.liters} {t('unit_liter')}
                  </td>
                  <td className="p-3 font-mono">
                    {log.pricePerLiter} {t('unit_currency')}
                  </td>
                  <td className="p-3 font-bold font-mono">
                    {log.totalCost} {t('unit_currency')}
                  </td>
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
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        log.isFullTank ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {log.isFullTank ? t('fuel_full_badge') : t('fuel_partial_badge')}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400">{log.notes || '—'}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onOpenEditFuel(log)}
                        className="text-amber-400 hover:text-amber-300 p-1 rounded hover:bg-slate-800 transition"
                        title={t('btn_edit')}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteFuel(log.id)}
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
