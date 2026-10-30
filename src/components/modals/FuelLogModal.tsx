import React from 'react';
import { Fuel } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface FuelLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingFuelId: string | null;
  fuelForm: {
    fillDate: string;
    odometer: number;
    liters: number;
    pricePerLiter: number;
    totalCost: number;
    isFullTank: boolean;
    notes: string;
  };
  setFuelForm: React.Dispatch<React.SetStateAction<any>>;
  selectedFuelType: string;
  setSelectedFuelType: (typeId: string) => void;
  settings: any;
  onSaveFuel: (e: React.FormEvent) => void;
  /** Lower bound for a brand new record: the odometer cannot run backwards. */
  minOdometer?: number;
  /** Blocks a second submit while the first is still in flight. */
  saving?: boolean;
}

export const FuelLogModal: React.FC<FuelLogModalProps> = ({
  isOpen,
  onClose,
  editingFuelId,
  fuelForm,
  setFuelForm,
  selectedFuelType,
  setSelectedFuelType,
  settings,
  onSaveFuel, saving, minOdometer,
}) => {
  const { t, lang } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-slate-950 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto shadow-2xl">
        {/* M3 Drag Handle for mobile */}
        <div className="sm:hidden m3-drag-handle" />
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <Fuel className="w-4 h-4 text-amber-500" />
            {editingFuelId ? t('modal_fuel_edit_title') : t('modal_fuel_new_title')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xs">
            {t('btn_cancel')}
          </button>
        </div>

        <form onSubmit={onSaveFuel} className="space-y-3">
          {/* Fuel Type Dropdown Selector */}
          {settings.fuelTypes && settings.fuelTypes.length > 0 && (
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">{t('modal_fuel_type_label')}</label>
              <select
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                value={selectedFuelType}
                onChange={(e) => {
                  const typeId = e.target.value;
                  setSelectedFuelType(typeId);
                  const matched = settings.fuelTypes?.find((ft: any) => ft.id === typeId);
                  if (matched) {
                    const price = matched.price;
                    const totalCost =
                      fuelForm.liters > 0 ? Number((fuelForm.liters * price).toFixed(2)) : fuelForm.totalCost;
                    setFuelForm({
                      ...fuelForm,
                      pricePerLiter: price,
                      totalCost,
                      notes: matched.name,
                    });
                  }
                }}
              >
                <option value="custom" disabled={Boolean(selectedFuelType && selectedFuelType !== 'custom')}>
                  {lang !== 'ar' ? 'Select fuel grade...' : 'اختر نوع الوقود...'}
                </option>
                {settings.fuelTypes.map((ft: any) => (
                  <option key={ft.id} value={ft.id}>
                    {ft.name} — ({ft.price} {t('unit_currency')}/{t('unit_liter')})
                  </option>
                ))}
                <option value="custom">
                  {lang !== 'ar' ? 'Custom price / other' : 'سعر مخصص / نوع آخر'}
                </option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">{t('fuel_th_date')}</label>
              <input
                required
                type="date"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                value={fuelForm.fillDate}
                onChange={(e) => setFuelForm({ ...fuelForm, fillDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                {t('fuel_th_odometer')} ({t('unit_km')})
              </label>
              <input
                required
                type="number"
                min={minOdometer ?? 0}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                value={fuelForm.odometer}
                onChange={(e) => setFuelForm({ ...fuelForm, odometer: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">{t('modal_fuel_liters_label')}</label>
              <input
                required
                type="number"
                step="any"
                min="0"
                placeholder="40.5"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                value={fuelForm.liters || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const liters = val === '' ? 0 : Number(val);
                  const price = fuelForm.pricePerLiter;
                  const totalCost =
                    price > 0 && liters > 0 ? Number((liters * price).toFixed(2)) : fuelForm.totalCost;
                  setFuelForm({ ...fuelForm, liters, totalCost });
                }}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">{t('modal_fuel_price_label')}</label>
              <input
                required
                type="number"
                step="any"
                min="0"
                placeholder="15.00"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                value={fuelForm.pricePerLiter || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const price = val === '' ? 0 : Number(val);
                  let newTotal = fuelForm.totalCost;
                  if (price > 0 && fuelForm.liters > 0) {
                    newTotal = Number((fuelForm.liters * price).toFixed(2));
                  }
                  setFuelForm({ ...fuelForm, pricePerLiter: price, totalCost: newTotal });
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">{t('modal_fuel_total_label')}</label>
            <input
              required
              type="number"
              step="any"
              min="0"
              placeholder="600"
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
              value={fuelForm.totalCost || ''}
              onChange={(e) => {
                const val = e.target.value;
                const totalCost = val === '' ? 0 : Number(val);
                const price = fuelForm.pricePerLiter;
                const liters =
                  price > 0 && totalCost > 0 ? Number((totalCost / price).toFixed(3)) : fuelForm.liters;
                setFuelForm({ ...fuelForm, totalCost, liters });
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="fullTank"
              checked={fuelForm.isFullTank}
              onChange={(e) => setFuelForm({ ...fuelForm, isFullTank: e.target.checked })}
            />
            <label htmlFor="fullTank" className="text-xs text-slate-300">
              {t('modal_fuel_full_tank_checkbox')}
            </label>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">{t('modal_fuel_notes_label')}</label>
            <input
              type="text"
              placeholder="Gas station / Fuel note"
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              value={fuelForm.notes}
              onChange={(e) => setFuelForm({ ...fuelForm, notes: e.target.value })}
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
              disabled={saving}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-1.5 rounded text-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingFuelId ? t('modal_fuel_btn_update') : t('modal_fuel_btn_save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
