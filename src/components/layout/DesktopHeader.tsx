import React from 'react';
import { Fuel, Wrench, Globe, LogOut, Bell } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { nextLang } from '@/i18n/util';
import { GoogleIcon } from '@/components/ui/GoogleIcon';

export interface DesktopHeaderProps {
  selectedVehicle: any | null;
  onOpenAddFuel: () => void;
  onOpenAddMaintenance: () => void;
  currentUser?: { id: string; email: string; name: string; picture: string | null } | null;
  onLoginGoogle?: () => void;
  onLogout?: () => void;
  urgentCount?: number;
  onSelectTab?: (tab: any) => void;
}

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  selectedVehicle,
  onOpenAddFuel,
  onOpenAddMaintenance,
  currentUser,
  onLoginGoogle,
  onLogout,
  urgentCount = 0,
  onSelectTab,
}) => {
  const { t, lang, setLang, dir, languages } = useTranslation();
  const nextCode = nextLang(lang);
  const nextName = languages.find((l) => l.code === nextCode)?.name ?? nextCode;

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
        {/* Urgent Alerts Bell */}
        {onSelectTab && (
          <button
            onClick={() => onSelectTab('alerts')}
            className="relative p-1.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition"
            title={t('nav_alerts')}
          >
            <Bell className="w-3.5 h-3.5 text-amber-400" />
            {urgentCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                {urgentCount}
              </span>
            )}
          </button>
        )}

        {/* Language Switcher */}
        <button
          onClick={() => setLang(nextCode)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          title={t('btn_change_language')}
        >
          <Globe className="w-3.5 h-3.5 text-amber-400" />
          <span>{nextName}</span>
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

        {/* User Identity / Google Login */}
        {currentUser ? (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            {currentUser.picture ? (
              <img
                src={currentUser.picture}
                alt={currentUser.name}
                className="w-7 h-7 rounded-full border border-amber-500/40 object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs text-slate-200 max-w-[110px] truncate font-medium">
              {currentUser.name}
            </span>
            <button
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-full transition"
              title={t('set_sign_out')}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onLoginGoogle}
            className="flex items-center gap-2 bg-slate-100 hover:bg-white text-slate-900 font-semibold px-3 py-1.5 rounded-full text-xs shadow-sm transition active:scale-95 ml-1"
          >
            <GoogleIcon className="w-3.5 h-3.5" />
            <span>{t('btn_login_google')}</span>
          </button>
        )}
      </div>
    </header>
  );
};
