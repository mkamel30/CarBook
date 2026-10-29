import React from 'react';
import {
  BookOpen,
  Loader2,
  Sparkles,
  AlertTriangle,
  Wrench,
  Gauge,
  Fuel,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface ManualTabProps {
  selectedVehicle: any;
  manualLoading: boolean;
  manualError: string | null;
  onFetchManual: () => void;
}

export const ManualTab: React.FC<ManualTabProps> = ({
  selectedVehicle,
  manualLoading,
  manualError,
  onFetchManual,
}) => {
  const { t } = useTranslation();

  const specs = typeof selectedVehicle?.specs === 'string'
    ? (() => {
        try {
          return JSON.parse(selectedVehicle.specs);
        } catch {
          return {};
        }
      })()
    : selectedVehicle?.specs || {};

  const hasSpecs = Boolean(selectedVehicle?.specs && Object.keys(specs).length > 0);

  return (
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
          onClick={onFetchManual}
          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-3.5 py-1.5 rounded text-xs flex items-center gap-1.5 transition shrink-0"
        >
          {manualLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('manual_loading')}
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              {hasSpecs ? t('manual_btn_refresh') : t('manual_btn_fetch')}
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
          <div className="text-xs font-semibold text-slate-200">{t('manual_loading')}</div>
          <p className="text-[11px] text-slate-400 max-w-md mx-auto">{t('manual_loading_sub')}</p>
        </div>
      )}

      {!manualLoading && hasSpecs && (
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
                  <span className="font-bold text-slate-100">
                    {specs.engineOilViscosity || t('manual_not_specified')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{t('manual_field_oil_capacity')}</span>
                  <span className="font-bold text-slate-100">
                    {specs.engineOilCapacityLiters || t('manual_not_specified')}
                  </span>
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
                  <span className="font-bold text-slate-100">
                    {specs.transmissionFluidType || t('manual_not_specified')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{t('manual_field_coolant')}</span>
                  <span className="font-bold text-slate-100">{specs.coolantType || t('manual_not_specified')}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{t('manual_field_brake_fluid')}</span>
                  <span className="font-bold text-slate-100">{specs.brakeFluidType || t('manual_not_specified')}</span>
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
                  <span className="font-bold text-emerald-400 font-mono">
                    {specs.tirePressurePsiFront || t('manual_not_specified')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{t('manual_field_tire_rear')}</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {specs.tirePressurePsiRear || t('manual_not_specified')}
                  </span>
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
                  <span className="font-bold text-slate-100">
                    {specs.fuelTankCapacityLiters || t('manual_not_specified')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{t('manual_field_octane')}</span>
                  <span className="font-bold text-amber-300">
                    {specs.recommendedFuelOctane || t('manual_not_specified')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">{t('manual_field_spark_plugs')}</span>
                  <span className="font-bold text-slate-100">{specs.sparkPlugType || t('manual_not_specified')}</span>
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
                  <span className="font-bold text-slate-100">{specs.batterySpec || t('manual_not_specified')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* General OEM Notes */}
          {specs.generalNotesAr && (
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-2">
              <div className="text-amber-400 font-semibold text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {t('manual_card_oem_tips')}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                {specs.generalNotesAr}
              </p>
            </div>
          )}
        </div>
      )}

      {!manualLoading && !hasSpecs && (
        <div className="max-w-md mx-auto my-12 text-center bg-slate-950 p-8 rounded-xl border border-slate-800 space-y-4">
          <BookOpen className="w-12 h-12 text-amber-500 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-100">{t('manual_empty_title')}</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{t('manual_empty_desc')}</p>
          </div>
          <button
            type="button"
            onClick={onFetchManual}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs inline-flex items-center gap-2 transition"
          >
            <Sparkles className="w-4 h-4" /> {t('manual_empty_btn')}
          </button>
        </div>
      )}
    </div>
  );
};
