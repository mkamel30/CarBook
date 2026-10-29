import React from 'react';
import { Car, Globe, Settings, LogOut, Bell } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

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

const GoogleIcon = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
);

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
              title="Logout"
            >
              <LogOut className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={onLoginGoogle}
            className="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-700 bg-white text-slate-900 text-[10px] font-bold active:scale-95 transition shadow-sm"
            title="Sign in with Google"
          >
            <GoogleIcon />
            <span>{lang === 'ar' ? 'دخول' : 'Login'}</span>
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
          onClick={() => {
            if (lang === 'ar') setLang('en');
            else if (lang === 'en') setLang('pl');
            else setLang('ar');
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-200 text-[10px] font-bold active:scale-95 transition"
          title="Change Language"
        >
          <Globe className="w-3 h-3 text-amber-400" />
          <span>{lang === 'ar' ? 'EN' : lang === 'en' ? 'PL' : 'عربي'}</span>
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
