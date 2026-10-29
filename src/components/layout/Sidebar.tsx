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
} from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface SidebarProps {
  vehicles: any[];
  selectedVehicle: any | null;
  onSelectVehicle: (v: any | null) => void;
  onOpenAddVehicle: () => void;
  activeTab: string;
  onSelectTab: (tab: any) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  vehicles,
  selectedVehicle,
  onSelectVehicle,
  onOpenAddVehicle,
  activeTab,
  onSelectTab,
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
            className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition ${
              activeTab === 'alerts'
                ? `bg-amber-500/10 text-amber-500 ${dir === 'rtl' ? 'border-r-2' : 'border-l-2'} border-amber-500`
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" /> {t('nav_alerts')}
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
