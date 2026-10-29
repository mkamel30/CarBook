import React from 'react';
import { Car, Sparkles, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleForm: {
    name: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string;
    initialOdometer: number;
    recommendedOil: string;
  };
  setVehicleForm: React.Dispatch<React.SetStateAction<any>>;
  aiLoading: boolean;
  aiProposal: any | null;
  aiError: string | null;
  onAiLookup: () => void;
  onSaveVehicle: (e: React.FormEvent) => void;
}

export const AddVehicleModal: React.FC<AddVehicleModalProps> = ({
  isOpen,
  onClose,
  vehicleForm,
  setVehicleForm,
  aiLoading,
  aiProposal,
  aiError,
  onAiLookup,
  onSaveVehicle,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-slate-950 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto shadow-2xl">
        {/* M3 Drag Handle for mobile */}
        <div className="sm:hidden m3-drag-handle" />
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <Car className="w-4 h-4 text-amber-500" /> {t('modal_car_add_title')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xs">
            {t('btn_cancel')}
          </button>
        </div>

        <form onSubmit={onSaveVehicle} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-300 mb-1">{t('modal_car_name_label')}</label>
            <input
              required
              type="text"
              placeholder={t('modal_car_name_placeholder')}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              value={vehicleForm.name}
              onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">{t('modal_car_make')}</label>
              <input
                required
                type="text"
                placeholder="Toyota / Hyundai"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                value={vehicleForm.make}
                onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">{t('modal_car_model')}</label>
              <input
                required
                type="text"
                placeholder="Corolla / Tucson"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                value={vehicleForm.model}
                onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">{t('modal_car_year')}</label>
              <input
                required
                type="number"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                value={vehicleForm.year}
                onChange={(e) => setVehicleForm({ ...vehicleForm, year: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">{t('modal_car_plate')}</label>
              <input
                type="text"
                placeholder="123 ABC"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                value={vehicleForm.licensePlate}
                onChange={(e) => setVehicleForm({ ...vehicleForm, licensePlate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">{t('modal_car_init_odo')}</label>
            <input
              required
              type="number"
              min="0"
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
              value={vehicleForm.initialOdometer}
              onChange={(e) =>
                setVehicleForm({ ...vehicleForm, initialOdometer: Number(e.target.value) })
              }
            />
          </div>

          {/* AI Auto-fetch Button */}
          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> {t('modal_car_ai_box')}
              </span>
              <button
                type="button"
                disabled={aiLoading}
                onClick={onAiLookup}
                className="bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/40 px-2.5 py-1 rounded text-xs transition font-medium"
              >
                {aiLoading ? t('modal_car_ai_loading') : t('modal_car_ai_btn')}
              </button>
            </div>

            {aiError && (
              <div className="text-[11px] text-rose-400 bg-rose-950/30 p-2 rounded border border-rose-900/40">
                {aiError}
              </div>
            )}

            {aiProposal && (
              <div className="text-xs space-y-2 bg-slate-950 p-2.5 rounded border border-slate-800">
                <div className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {t('modal_car_ai_found')}
                </div>
                <div>
                  {t('modal_car_ai_oil')}{' '}
                  <span className="font-bold text-slate-100">{aiProposal.recommendedOil}</span>
                </div>
                <div className="text-[11px] text-slate-400">{t('modal_car_ai_note')}</div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">{t('modal_car_oil_label')}</label>
            <input
              type="text"
              placeholder="5W-30 Full Synthetic"
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              value={vehicleForm.recommendedOil}
              onChange={(e) => setVehicleForm({ ...vehicleForm, recommendedOil: e.target.value })}
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200"
            >
              {t('btn_cancel')}
            </button>
            <button
              type="submit"
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-1.5 rounded text-xs transition"
            >
              {t('modal_car_btn_save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
