import React from 'react';
import { Gauge, Fuel, Wrench, Sparkles, FileText } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface MobileBottomNavProps {
  activeTab: string;
  onSelectTab: (tab: any) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const { t } = useTranslation();

  return (
    <nav className="m3-bottom-nav md:hidden fixed bottom-0 inset-x-0 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 z-30 flex items-center justify-around px-2 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] shadow-2xl print:hidden">
      {/* Destination 1: Overview */}
      <button
        onClick={() => onSelectTab('overview')}
        className="flex flex-col items-center gap-0.5 flex-1 py-1 active:scale-95 transition"
      >
        <div
          className={`w-14 h-8 rounded-full flex items-center justify-center transition-all ${
            activeTab === 'overview'
              ? 'bg-amber-500/20 text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Gauge className="w-4 h-4" />
        </div>
        <span
          className={`text-[10px] font-medium ${
            activeTab === 'overview' ? 'text-amber-400 font-bold' : 'text-slate-400'
          }`}
        >
          {t('nav_overview')}
        </span>
      </button>

      {/* Destination 2: Fuel */}
      <button
        onClick={() => onSelectTab('fuel')}
        className="flex flex-col items-center gap-0.5 flex-1 py-1 active:scale-95 transition"
      >
        <div
          className={`w-14 h-8 rounded-full flex items-center justify-center transition-all ${
            activeTab === 'fuel'
              ? 'bg-amber-500/20 text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Fuel className="w-4 h-4" />
        </div>
        <span
          className={`text-[10px] font-medium ${
            activeTab === 'fuel' ? 'text-amber-400 font-bold' : 'text-slate-400'
          }`}
        >
          {t('nav_fuel')}
        </span>
      </button>

      {/* Destination 3: Maintenance */}
      <button
        onClick={() => onSelectTab('maintenance')}
        className="flex flex-col items-center gap-0.5 flex-1 py-1 active:scale-95 transition"
      >
        <div
          className={`w-14 h-8 rounded-full flex items-center justify-center transition-all ${
            activeTab === 'maintenance'
              ? 'bg-amber-500/20 text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wrench className="w-4 h-4" />
        </div>
        <span
          className={`text-[10px] font-medium ${
            activeTab === 'maintenance' ? 'text-amber-400 font-bold' : 'text-slate-400'
          }`}
        >
          {t('nav_maintenance')}
        </span>
      </button>

      {/* Destination 4: AI Doctor */}
      <button
        onClick={() => onSelectTab('doctor')}
        className="flex flex-col items-center gap-0.5 flex-1 py-1 active:scale-95 transition"
      >
        <div
          className={`w-14 h-8 rounded-full flex items-center justify-center transition-all ${
            activeTab === 'doctor'
              ? 'bg-amber-500/20 text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
        </div>
        <span
          className={`text-[10px] font-medium ${
            activeTab === 'doctor' ? 'text-amber-400 font-bold' : 'text-slate-400'
          }`}
        >
          {t('nav_doctor')}
        </span>
      </button>

      {/* Destination 5: Report */}
      <button
        onClick={() => onSelectTab('report')}
        className="flex flex-col items-center gap-0.5 flex-1 py-1 active:scale-95 transition"
      >
        <div
          className={`w-14 h-8 rounded-full flex items-center justify-center transition-all ${
            activeTab === 'report'
              ? 'bg-amber-500/20 text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
        </div>
        <span
          className={`text-[10px] font-medium ${
            activeTab === 'report' ? 'text-amber-400 font-bold' : 'text-slate-400'
          }`}
        >
          {t('nav_report')}
        </span>
      </button>
    </nav>
  );
};
