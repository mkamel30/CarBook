import React from 'react';
import { Fuel, Wrench, PlusCircle } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface MobileFabProps {
  selectedVehicle: any | null;
  showFabMenu: boolean;
  setShowFabMenu: (v: boolean) => void;
  onOpenAddFuel: () => void;
  onOpenAddMaintenance: () => void;
}

export const MobileFab: React.FC<MobileFabProps> = ({
  selectedVehicle,
  showFabMenu,
  setShowFabMenu,
  onOpenAddFuel,
  onOpenAddMaintenance,
}) => {
  const { t, dir } = useTranslation();

  if (!selectedVehicle) return null;

  return (
    <div
      className="md:hidden fixed bottom-20 z-40 transition-all print:hidden"
      style={{ [dir === 'rtl' ? 'left' : 'right']: '1.25rem' }}
    >
      {showFabMenu && (
        <div className="mb-3 space-y-2 flex flex-col items-end animate-in fade-in slide-in-from-bottom-2 duration-150">
          <button
            onClick={() => {
              setShowFabMenu(false);
              onOpenAddFuel();
            }}
            className="flex items-center gap-2 bg-slate-900 text-amber-400 border border-amber-500/40 px-4 py-2.5 rounded-full text-xs font-bold shadow-2xl active:scale-95 transition"
          >
            <Fuel className="w-4 h-4" /> {t('btn_add_fuel')}
          </button>
          <button
            onClick={() => {
              setShowFabMenu(false);
              onOpenAddMaintenance();
            }}
            className="flex items-center gap-2 bg-slate-900 text-slate-100 border border-slate-700 px-4 py-2.5 rounded-full text-xs font-bold shadow-2xl active:scale-95 transition"
          >
            <Wrench className="w-4 h-4" /> {t('btn_add_maintenance')}
          </button>
        </div>
      )}
      <button
        onClick={() => setShowFabMenu(!showFabMenu)}
        className="m3-fab w-13 h-13 rounded-2xl flex items-center justify-center font-bold text-slate-950 shadow-2xl active:scale-95 transition p-3"
        aria-label="Add entry"
      >
        <PlusCircle
          className={`w-6 h-6 transition-transform duration-200 ${
            showFabMenu ? 'rotate-45' : ''
          }`}
        />
      </button>
    </div>
  );
};
