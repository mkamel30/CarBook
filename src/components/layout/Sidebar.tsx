import React from 'react';
import {
  Car,
  Fuel,
  Wrench,
  AlertTriangle,
  FileText,
  Settings,
  PlusCircle,
  Gauge,
  BookOpen,
  HelpCircle,
  LogOut,
} from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface SidebarProps {
  vehicles: any[];
  selectedVehicle: any | null;
  onSelectVehicle: (v: any | null) => void;
  onOpenAddVehicle: () => void;
  activeTab: string;
  onSelectTab: (tab: any) => void;
  currentUser?: { id: string; email: string; name: string; picture: string | null } | null;
  onLoginGoogle?: () => void;
  onLogout?: () => void;
  urgentCount?: number;
}

const GoogleIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
);

export const Sidebar: React.FC<SidebarProps> = ({
  vehicles,
  selectedVehicle,
  onSelectVehicle,
  onOpenAddVehicle,
  activeTab,
  onSelectTab,
  currentUser,
  onLoginGoogle,
  onLogout,
  urgentCount = 0,
}) => {
  const { t, dir } = useTranslation();

  return (
    <aside
      className={`hidden md:flex w-64 lg:w-72 bg-slate-950 flex-col justify-between shrink-0 ${
        dir === 'rtl' ? 'border-l' : 'border-r'
      } border-slate-800`}
    >
      <div>
        {/* App Branding */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="text-amber-500 w-6 h-6 shrink-0" />
            <div>
              <h1 className="font-bold text-sm tracking-wide">CarBook</h1>
              <p className="text-xs text-slate-400">{t('app_tagline')}</p>
            </div>
          </div>
        </div>

        {/* Vehicle Selector */}
        <div className="p-3 border-b border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase">
              {t('nav_current_vehicle')}
            </span>
            <button
              onClick={onOpenAddVehicle}
              className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1 font-medium"
            >
              <PlusCircle className="w-3.5 h-3.5" /> {t('nav_add_vehicle')}
            </button>
          </div>
          {vehicles.length === 0 ? (
            <div className="text-xs text-slate-500 p-2 text-center bg-slate-900 rounded border border-dashed border-slate-800">
              {t('app_no_vehicles')}
            </div>
          ) : (
            <select
              className="w-full bg-slate-900 border border-slate-700 text-xs rounded p-2 text-slate-200 outline-none focus:border-amber-500"
              value={selectedVehicle?.id || ''}
              onChange={(e) => {
                const v = vehicles.find((item) => item.id === e.target.value);
                onSelectVehicle(v || null);
              }}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.make} {v.model})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="p-2 space-y-1 text-sm">
          <button
            onClick={() => onSelectTab('overview')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
              activeTab === 'overview'
                ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Gauge className="w-4 h-4 shrink-0" /> {t('nav_overview')}
          </button>
          <button
            onClick={() => onSelectTab('fuel')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
              activeTab === 'fuel'
                ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Fuel className="w-4 h-4 shrink-0" /> {t('nav_fuel')}
          </button>
          <button
            onClick={() => onSelectTab('maintenance')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
              activeTab === 'maintenance'
                ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-4 h-4 shrink-0" /> {t('nav_maintenance')}
          </button>
          <button
            onClick={() => onSelectTab('alerts')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition ${
              activeTab === 'alerts'
                ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('nav_alerts')}</span>
            </div>
            {urgentCount > 0 && (
              <span className="bg-rose-500 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full font-mono animate-pulse">
                {urgentCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onSelectTab('manual')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
              activeTab === 'manual'
                ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" /> {t('nav_manual')}
          </button>
          <button
            onClick={() => onSelectTab('doctor')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
              activeTab === 'doctor'
                ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-4 h-4 shrink-0" /> {t('nav_doctor')}
          </button>
          <button
            onClick={() => onSelectTab('report')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
              activeTab === 'report'
                ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" /> {t('nav_report')}
          </button>
        </nav>
      </div>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        {currentUser ? (
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              {currentUser.picture ? (
                <img
                  src={currentUser.picture}
                  alt={currentUser.name}
                  className="w-7 h-7 rounded-full border border-amber-500/40 object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center shrink-0">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs text-slate-200 font-semibold truncate">{currentUser.name}</div>
                <div className="text-[10px] text-slate-400 truncate">{currentUser.email}</div>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="text-slate-400 hover:text-rose-400 p-1 hover:bg-slate-800 rounded transition"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onLoginGoogle}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-white text-slate-950 font-bold px-3 py-2 rounded text-xs shadow-sm transition active:scale-95"
          >
            <GoogleIcon />
            <span>{dir === 'rtl' ? 'دخول بحساب جوجل' : 'Sign in with Google'}</span>
          </button>
        )}

        <button
          onClick={() => onSelectTab('settings')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition ${
            activeTab === 'settings'
              ? 'bg-amber-500/10 text-amber-500'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" /> {t('nav_settings')}
        </button>
      </div>
    </aside>
  );
};
