import React from 'react';
import { Fuel, Wrench, Globe } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface DesktopHeaderProps {
  selectedVehicle: any | null;
  onOpenAddFuel: () => void;
  onOpenAddMaintenance: () => void;
}

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  selectedVehicle,
  onOpenAddFuel,
  onOpenAddMaintenance,
}) => {
  const { t, lang, setLang, dir } = useTranslation();

  return (
    <header className="hidden md:flex h-14 border-b border-slate-800 bg-slate-950/60 px-6 items-center justify-between shrink-0">
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
            <div
              className={`text-xs text-slate-400 flex items-center gap-1 ${
                dir === 'rtl' ? 'border-r pr-3 mr-3' : 'border-l pl-3 ml-3'
              } border-slate-800`}
            >
              <span>{t('header_odometer')}</span>
              <span className="font-bold text-amber-400 font-mono">
                {selectedVehicle.currentOdometer?.toLocaleString()} {t('unit_km')}
              </span>
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
              onClick={onOpenAddFuel}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition"
            >
              <Fuel className="w-3.5 h-3.5" /> {t('btn_add_fuel')}
            </button>
            <button
              onClick={onOpenAddMaintenance}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-1.5 rounded text-xs flex items-center gap-1.5 border border-slate-700 transition"
            >
              <Wrench className="w-3.5 h-3.5" /> {t('btn_add_maintenance')}
            </button>
          </>
        )}
      </div>
    </header>
  );
};
