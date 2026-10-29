import React from 'react';
import { Car, Globe, Settings } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface MobileTopBarProps {
  vehicles: any[];
  selectedVehicle: any | null;
  onSelectVehicle: (v: any | null) => void;
  activeTab: string;
  onSelectTab: (tab: any) => void;
}

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  vehicles,
  selectedVehicle,
  onSelectVehicle,
  activeTab,
  onSelectTab,
}) => {
  const { t, lang, setLang } = useTranslation();

  return (
    <header className="md:hidden sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-3.5 py-2.5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-500 shrink-0">
          <Car className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="font-bold text-xs tracking-wide">CarBook</h1>
            {selectedVehicle && (
              <span className="text-[10px] bg-amber-500/15 text-amber-400 font-mono font-bold px-1.5 py-0.5 rounded">
                {selectedVehicle.currentOdometer?.toLocaleString()} {t('unit_km')}
              </span>
            )}
          </div>
          {selectedVehicle ? (
            <span className="text-[11px] text-slate-300 font-medium truncate block">
              {selectedVehicle.name} • {selectedVehicle.licensePlate || `${selectedVehicle.make} ${selectedVehicle.model}`}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">{t('app_select_prompt')}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {vehicles.length > 1 && (
          <select
            className="bg-slate-900 border border-slate-700 text-[11px] rounded-full px-2 py-1 text-slate-200 outline-none max-w-[95px] truncate"
            value={selectedVehicle?.id || ''}
            onChange={(e) => {
              const v = vehicles.find((item) => item.id === e.target.value);
              onSelectVehicle(v || null);
            }}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-200 text-[10px] font-bold active:scale-95 transition"
          title="Change Language"
        >
          <Globe className="w-3 h-3 text-amber-400" />
          <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
        </button>
        <button
          onClick={() => onSelectTab('settings')}
          className={`p-1.5 rounded-full border transition active:scale-95 ${
            activeTab === 'settings'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              : 'bg-slate-900 border-slate-700 text-slate-300'
          }`}
          title={t('nav_settings')}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
