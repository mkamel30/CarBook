import React from 'react';
import {
  FileText,
  FileSpreadsheet,
  Printer,
  ShieldCheck,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { exportVehicleDossierToExcel } from '@/services/exportExcel';

export interface ReportsTabProps {
  selectedVehicle: any;
  reportData: any | null;
  maintenanceLogs: any[];
  fuelLogs: any[];
  manualLoading: boolean;
  onFetchManual: () => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  selectedVehicle,
  reportData,
  maintenanceLogs,
  fuelLogs,
  manualLoading,
  onFetchManual,
}) => {
  const { t, lang, dir } = useTranslation();

  const rawSpecs = selectedVehicle?.specs || reportData?.vehicle?.specs;
  let specs: any = {};
  if (rawSpecs) {
    try {
      specs = typeof rawSpecs === 'string' ? JSON.parse(rawSpecs) : rawSpecs;
    } catch {
      specs = {};
    }
  }

  let tirePressure = selectedVehicle?.tirePressureSpec || '—';
  if (specs.tirePressurePsiFront || specs.tirePressurePsiRear) {
    if (
      specs.tirePressurePsiFront &&
      specs.tirePressurePsiRear &&
      specs.tirePressurePsiFront === specs.tirePressurePsiRear
    ) {
      tirePressure = specs.tirePressurePsiFront;
    } else {
      tirePressure =
        lang === 'ar'
          ? `أمام: ${specs.tirePressurePsiFront || '—'} | خلف: ${specs.tirePressurePsiRear || '—'}`
          : `Front: ${specs.tirePressurePsiFront || '—'} | Rear: ${specs.tirePressurePsiRear || '—'}`;
    }
  }

  const hasSpecs = Boolean(rawSpecs && Object.keys(specs).length > 0);

  return (
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
              {t('rep_date')}{' '}
              {new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className={`space-y-1 ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>
            <div className="text-base font-bold text-slate-100 print:text-slate-950">
              {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year})
            </div>
            <div className="text-xs text-amber-400 print:text-amber-800 font-mono font-bold">
              {t('header_plate')} {selectedVehicle.licensePlate || t('header_no_plate')}
            </div>
            <div className="text-[11px] text-slate-400 print:text-slate-600">{selectedVehicle.name}</div>
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
              {maintenanceLogs.reduce((acc, m) => acc + (Number(m.totalCost) || 0), 0).toLocaleString()}{' '}
              {t('unit_currency')}
            </div>
          </div>
        </div>

        {/* Technical & OEM Specifications Box */}
        <div className="print-card-subtle bg-slate-900/60 p-4 rounded-lg border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 print:text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
              {lang === 'ar' ? 'المواصفات الفنية وسوائل المحرك المعتمدة' : 'OEM Technical & Fluid Specifications'}
            </h3>
            {!hasSpecs && (
              <button
                type="button"
                disabled={manualLoading}
                onClick={onFetchManual}
                className="print:hidden text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded flex items-center gap-1 transition font-medium"
              >
                {manualLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {lang === 'ar' ? 'جلب بذكاء الاصطناعي' : 'Fetch with AI'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="flex flex-col border-b border-slate-800 print:border-slate-300 py-1.5">
              <span className="text-[11px] text-slate-400 print:text-slate-600 mb-0.5">
                {lang === 'ar' ? 'سائل التبريد:' : 'Coolant:'}
              </span>
              <span className="font-semibold text-slate-200 print:text-slate-900 break-words leading-tight">
                {specs.coolantType || selectedVehicle.coolantSpec || '—'}
              </span>
            </div>
            <div className="flex flex-col border-b border-slate-800 print:border-slate-300 py-1.5">
              <span className="text-[11px] text-slate-400 print:text-slate-600 mb-0.5">
                {lang === 'ar' ? 'زيت القير:' : 'Trans Fluid:'}
              </span>
              <span className="font-semibold text-slate-200 print:text-slate-900 break-words leading-tight">
                {specs.transmissionFluidType || selectedVehicle.transmissionSpec || '—'}
              </span>
            </div>
            <div className="flex flex-col border-b border-slate-800 print:border-slate-300 py-1.5">
              <span className="text-[11px] text-slate-400 print:text-slate-600 mb-0.5">
                {lang === 'ar' ? 'ضغط الإطارات:' : 'Tire Pressure:'}
              </span>
              <span className="font-semibold text-slate-200 print:text-slate-900 break-words leading-tight">
                {tirePressure}
              </span>
            </div>
            <div className="flex flex-col border-b border-slate-800 print:border-slate-300 py-1.5">
              <span className="text-[11px] text-slate-400 print:text-slate-600 mb-0.5">
                {lang === 'ar' ? 'سعة الخزان:' : 'Tank Capacity:'}
              </span>
              <span className="font-semibold text-slate-200 print:text-slate-900 break-words leading-tight">
                {specs.fuelTankCapacityLiters || (selectedVehicle.fuelTankCapacity ? `${selectedVehicle.fuelTankCapacity} L` : '—')}
              </span>
            </div>
            <div className="flex flex-col border-b border-slate-800 print:border-slate-300 py-1.5">
              <span className="text-[11px] text-slate-400 print:text-slate-600 mb-0.5">
                {lang === 'ar' ? 'شمعات الاحتراق:' : 'Spark Plugs:'}
              </span>
              <span className="font-semibold text-slate-200 print:text-slate-900 break-words leading-tight">
                {specs.sparkPlugType || selectedVehicle.sparkPlugsSpec || '—'}
              </span>
            </div>
            <div className="flex flex-col border-b border-slate-800 print:border-slate-300 py-1.5">
              <span className="text-[11px] text-slate-400 print:text-slate-600 mb-0.5">
                {lang === 'ar' ? 'مواصفة البطارية:' : 'Battery:'}
              </span>
              <span className="font-semibold text-slate-200 print:text-slate-900 break-words leading-tight">
                {specs.batterySpec || selectedVehicle.batterySpec || '—'}
              </span>
            </div>
            <div className="flex flex-col border-b border-slate-800 print:border-slate-300 py-1.5">
              <span className="text-[11px] text-slate-400 print:text-slate-600 mb-0.5">
                {lang === 'ar' ? 'لزوجة زيت المحرك:' : 'Engine Oil:'}
              </span>
              <span className="font-semibold text-slate-200 print:text-slate-900 break-words leading-tight">
                {specs.engineOilViscosity || selectedVehicle.recommendedOil || '—'}
              </span>
            </div>
            <div className="flex flex-col border-b border-slate-800 print:border-slate-300 py-1.5">
              <span className="text-[11px] text-slate-400 print:text-slate-600 mb-0.5">
                {lang === 'ar' ? 'سعة زيت المحرك:' : 'Oil Capacity:'}
              </span>
              <span className="font-semibold text-slate-200 print:text-slate-900 break-words leading-tight">
                {specs.engineOilCapacityLiters || '—'}
              </span>
            </div>
            <div className="flex flex-col border-b border-slate-800 print:border-slate-300 py-1.5">
              <span className="text-[11px] text-slate-400 print:text-slate-600 mb-0.5">
                {lang === 'ar' ? 'سائل الفرامل:' : 'Brake Fluid:'}
              </span>
              <span className="font-semibold text-slate-200 print:text-slate-900 break-words leading-tight">
                {specs.brakeFluidType || '—'}
              </span>
            </div>
          </div>

          {specs.generalNotesAr && (
            <div className="text-[11px] text-slate-300 print:text-slate-800 bg-slate-950/60 p-2.5 rounded border border-slate-800 print:border-slate-300 leading-relaxed mt-2">
              <span className="font-bold text-amber-400 print:text-slate-900 block mb-0.5">
                {lang === 'ar' ? '💡 إرشادات وتوصيات المصنع:' : '💡 Key OEM Guidelines:'}
              </span>
              {specs.generalNotesAr}
            </div>
          )}
        </div>

        {/* Maintenance Log Table in Report with horizontal scroll */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-300 print:text-slate-900 flex items-center justify-between">
            <span>{t('rep_table_title')}</span>
            <span className="text-[11px] font-normal text-slate-400 print:text-slate-600">
              {maintenanceLogs.length} {lang === 'ar' ? 'عملية مسجلة' : 'records logged'}
            </span>
          </h3>
          <div className="border border-slate-800 print:border-slate-300 rounded overflow-x-auto print:overflow-visible table-scrollbar">
            <table className="w-full min-w-[650px] print:min-w-0 text-start text-xs">
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
                    const rawParts = m.partsList ?? m.parts_list ?? m.partsBreakdown;
                    if (rawParts) {
                      try {
                        parts = typeof rawParts === 'string' ? JSON.parse(rawParts) : rawParts;
                      } catch {}
                    }
                    return (
                      <tr key={idx}>
                        <td className="p-2 font-mono whitespace-nowrap">{m.serviceDate}</td>
                        <td className="p-2 font-mono whitespace-nowrap">
                          {m.odometer?.toLocaleString()} {t('unit_km')}
                        </td>
                        <td className="p-2">
                          <div className="font-semibold text-slate-200 print:text-slate-950">{m.title}</div>
                          {Array.isArray(parts) && parts.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {parts.map((p, pIdx) => (
                                <span
                                  key={pIdx}
                                  className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-slate-900 print:bg-slate-100 border border-slate-800 print:border-slate-300 text-slate-300 print:text-slate-800"
                                >
                                  {p.name} (
                                  {p.condition === 'used_import'
                                    ? lang === 'ar'
                                      ? 'استيراد'
                                      : 'Used'
                                    : lang === 'ar'
                                    ? 'جديد'
                                    : 'New'}
                                  : {p.cost} {t('unit_currency')})
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-2">{m.workshop || '—'}</td>
                        <td className="p-2 font-mono font-bold whitespace-nowrap">
                          {m.totalCost} {t('unit_currency')}
                        </td>
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
  );
};
