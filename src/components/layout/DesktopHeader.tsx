import React from 'react';
import { Fuel, Wrench, Globe, LogOut, Bell } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

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

const GoogleIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
);

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
          onClick={() => {
            if (lang === 'ar') setLang('en');
            else if (lang === 'en') setLang('pl');
            else setLang('ar');
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          title="Change Language"
        >
          <Globe className="w-3.5 h-3.5 text-amber-400" />
          <span>{lang === 'ar' ? 'English' : lang === 'en' ? 'Polski' : 'العربية'}</span>
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
              title={lang === 'ar' ? 'تسجيل الخروج' : 'Sign out'}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onLoginGoogle}
            className="flex items-center gap-2 bg-slate-100 hover:bg-white text-slate-900 font-semibold px-3 py-1.5 rounded-full text-xs shadow-sm transition active:scale-95 ml-1"
          >
            <GoogleIcon />
            <span>{lang === 'ar' ? 'دخول بحساب جوجل' : 'Sign in with Google'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
