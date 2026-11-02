import React from 'react';
import { Globe, Settings, LogOut, Bell } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { nextLang } from '@/i18n/util';
import { GoogleIcon } from '@/components/ui/GoogleIcon';

export interface MobileTopBarProps {
  vehicles: any[];
  selectedVehicle: any | null;
  onSelectVehicle: (v: any | null) => void;
  activeTab: string;
  onSelectTab: (tab: any) => void;
  currentUser?: { id: string; email: string; name: string; picture: string | null } | null;
  onLoginGoogle?: () => void;
  onLogout?: () => void;
  urgentCount?: number;
}

// Endonyms (each language written in its own script) live in the dictionaries;
// the button shows what the NEXT language is called, not the current one.
const LANG_SHORT_KEY: Record<string, string> = { ar: 'lang_short_ar', en: 'lang_short_en', pl: 'lang_short_pl' };

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  vehicles,
  selectedVehicle,
  onSelectVehicle,
  activeTab,
  onSelectTab,
  currentUser,
  onLoginGoogle,
  onLogout,
  urgentCount = 0,
}) => {
  const { t, lang, setLang } = useTranslation();
  const nextCode = nextLang(lang);

  return (
    <header className="md:hidden sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-3.5 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center shrink-0">
          <img src="/logo.png" alt="CarBook" className="w-8 h-8 object-cover" />
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
        {currentUser ? (
          <div className="flex items-center gap-1">
            {currentUser.picture ? (
              <img
                src={currentUser.picture}
                alt={currentUser.name}
                className="w-6 h-6 rounded-full border border-amber-500/40 object-cover"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold text-[10px] flex items-center justify-center">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
            )}
            <button
              onClick={onLogout}
              className="p-1 rounded-full text-slate-400 hover:text-rose-400 active:scale-95 transition"
              title={t('set_sign_out')}
            >
              <LogOut className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={onLoginGoogle}
            className="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-700 bg-white text-slate-900 text-[10px] font-bold active:scale-95 transition shadow-sm"
            title={t('btn_login_google')}
          >
            <GoogleIcon className="w-3 h-3" />
            <span>{t('btn_login_short')}</span>
          </button>
        )}

        {vehicles.length > 1 && (
          <select
            className="bg-slate-900 border border-slate-700 text-[11px] rounded-full px-2 py-1 text-slate-200 outline-none max-w-[80px] truncate"
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
          onClick={() => setLang(nextCode)}
          className="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-200 text-[10px] font-bold active:scale-95 transition"
          title={t('set_lang_title')}
        >
          <Globe className="w-3 h-3 text-amber-400" />
          <span>{LANG_SHORT_KEY[nextCode] ? t(LANG_SHORT_KEY[nextCode]) : nextCode.toUpperCase()}</span>
        </button>
        <button
          onClick={() => onSelectTab('alerts')}
          className={`relative p-1.5 rounded-full border transition active:scale-95 ${
            activeTab === 'alerts'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              : 'bg-slate-900 border-slate-700 text-slate-300'
          }`}
          title={t('nav_alerts')}
        >
          <Bell className="w-3.5 h-3.5" />
          {urgentCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
              {urgentCount}
            </span>
          )}
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
