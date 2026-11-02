import React from 'react';
import { Wrench, PlusCircle, Trash2 } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { Modal } from '@/components/ui/Modal';
import { deriveMaintenanceTotal } from '@/components/tabs/maintenanceTotals';

export interface MaintenancePartItem {
  id: string;
  name: string;
  condition: 'new' | 'used_import';
  cost: number;
}

export interface MaintenanceFormData {
  serviceDate: string;
  odometer: number;
  serviceType: string;
  title: string;
  partsCost: number;
  laborCost: number;
  totalCost: number;
  workshop: string;
  notes: string;
  nextDueOdometer: number;
  nextDueDate: string;
}

export interface MaintenanceLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingMaintenanceId: string | null;
  maintenanceForm: MaintenanceFormData;
  setMaintenanceForm: React.Dispatch<React.SetStateAction<MaintenanceFormData>>;
  partsList: MaintenancePartItem[];
  setPartsList: React.Dispatch<React.SetStateAction<MaintenancePartItem[]>>;
  onSaveMaintenance: (e: React.FormEvent) => void;
  /** Lower bound for a brand new record: the odometer cannot run backwards. */
  minOdometer?: number;
  /** Blocks a second submit while the first is still in flight. */
  saving?: boolean;
}

export const MaintenanceLogModal: React.FC<MaintenanceLogModalProps> = ({
  isOpen,
  onClose,
  editingMaintenanceId,
  maintenanceForm,
  setMaintenanceForm,
  partsList,
  setPartsList,
  onSaveMaintenance, saving, minOdometer,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const totalDerivation = deriveMaintenanceTotal(
    maintenanceForm.partsCost,
    maintenanceForm.laborCost,
    maintenanceForm.totalCost,
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} panelClassName="max-w-lg" ariaLabel={editingMaintenanceId ? t('modal_maint_edit_title') : t('modal_maint_new_title')}>
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-500" />
            {editingMaintenanceId ? t('modal_maint_edit_title') : t('modal_maint_new_title')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xs">
            {t('btn_cancel')}
          </button>
        </div>

        <form onSubmit={onSaveMaintenance} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_date')}</label>
              <input
                required
                type="date"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                value={maintenanceForm.serviceDate}
                onChange={e => setMaintenanceForm({ ...maintenanceForm, serviceDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_odo')}</label>
              <input
                required
                type="number"
                min={minOdometer ?? 0}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                value={maintenanceForm.odometer}
                onChange={e => setMaintenanceForm({ ...maintenanceForm, odometer: Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_title_label')}</label>
            <input
              required
              type="text"
              placeholder={t('modal_maint_title_placeholder')}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              value={maintenanceForm.title}
              onChange={e => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">{t('maint_service_type_label')}</label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              value={maintenanceForm.serviceType}
              onChange={e => setMaintenanceForm({ ...maintenanceForm, serviceType: e.target.value })}
            >
              <option value="oil_change">{t('maint_type_oil')}</option>
              <option value="periodic">{t('maint_type_periodic')}</option>
              <option value="brakes">{t('maint_type_brakes')}</option>
              <option value="tires">{t('maint_type_tires')}</option>
              <option value="repair">{t('maint_type_repair')}</option>
              <option value="other">{t('maint_type_other')}</option>
            </select>
          </div>

          {/* Parts Items List */}
          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-200">{t('modal_maint_parts_box_title')}</span>
              <button
                type="button"
                onClick={() => {
                  setPartsList([
                    ...partsList,
                    { id: `p_${Date.now()}`, name: '', condition: 'new', cost: 0 },
                  ]);
                }}
                className="text-xs text-amber-500 hover:text-amber-400 font-medium flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" /> {t('modal_maint_add_part_btn')}
              </button>
            </div>

            {partsList.length === 0 ? (
              <div className="text-[11px] text-slate-400 text-center py-2 border border-dashed border-slate-800 rounded">
                {t('maint_parts_empty')}
              </div>
            ) : (
              <div className="space-y-2">
                {partsList.map((part, idx) => (
                  <div key={part.id || idx} className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded border border-slate-800">
                    {/* Part Name */}
                    <div className="col-span-5">
                      <input
                        required
                        type="text"
                        placeholder={t('modal_maint_part_name')}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                        value={part.name}
                        onChange={e => {
                          const updated = [...partsList];
                          updated[idx].name = e.target.value;
                          setPartsList(updated);
                        }}
                      />
                    </div>

                    {/* Condition (New vs Used Import) */}
                    <div className="col-span-3">
                      <select
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                        value={part.condition}
                        onChange={e => {
                          const updated = [...partsList];
                          updated[idx].condition = e.target.value as 'new' | 'used_import';
                          setPartsList(updated);
                        }}
                      >
                        <option value="new">{t('maint_cond_new')}</option>
                        <option value="used_import">{t('maint_cond_used')}</option>
                      </select>
                    </div>

                    {/* Part Cost */}
                    <div className="col-span-3">
                      <div className="flex items-center gap-1">
                        <input
                          required
                          type="number"
                          step="any"
                          min="0"
                          placeholder={t('modal_maint_part_price')}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 font-mono outline-none focus:border-amber-500 text-center"
                          value={part.cost || ''}
                          onChange={e => {
                            const val = e.target.value;
                            const cost = val === '' ? 0 : Number(val);
                            const updated = [...partsList];
                            updated[idx].cost = cost;
                            setPartsList(updated);

                            const totalParts = updated.reduce((s, p) => s + (Number(p.cost) || 0), 0);
                            setMaintenanceForm(prev => ({
                              ...prev,
                              partsCost: totalParts,
                              totalCost: totalParts + Number(prev.laborCost),
                            }));
                          }}
                        />
                        <span className="text-[11px] text-slate-400">{t('unit_currency')}</span>
                      </div>
                    </div>

                    {/* Delete Button */}
                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = partsList.filter((_, i) => i !== idx);
                          setPartsList(updated);
                          const totalParts = updated.reduce((s, p) => s + (Number(p.cost) || 0), 0);
                          setMaintenanceForm(prev => ({
                            ...prev,
                            partsCost: totalParts,
                            totalCost: totalParts + Number(prev.laborCost),
                          }));
                        }}
                        className="text-rose-400 hover:text-rose-300 p-1 hover:bg-slate-800 rounded"
                        title={t('btn_delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cost Summary Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                {t('modal_maint_parts_total_label')} {partsList.length > 0 && <span className="text-amber-400 font-mono">({partsList.length})</span>}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0"
                readOnly={partsList.length > 0}
                className={`w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono ${
                  partsList.length > 0 ? 'bg-slate-900/40 text-amber-300 font-bold cursor-not-allowed' : ''
                }`}
                value={maintenanceForm.partsCost || ''}
                onChange={e => {
                  const parts = Number(e.target.value) || 0;
                  setMaintenanceForm({ ...maintenanceForm, partsCost: parts, totalCost: parts + maintenanceForm.laborCost });
                }}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_labor_label')}</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                value={maintenanceForm.laborCost || ''}
                onChange={e => {
                  const val = e.target.value;
                  const labor = val === '' ? 0 : Number(val);
                  const parts = partsList.length > 0
                    ? partsList.reduce((s, p) => s + (Number(p.cost) || 0), 0)
                    : maintenanceForm.partsCost;
                  setMaintenanceForm({ ...maintenanceForm, laborCost: labor, totalCost: parts + labor });
                }}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1 font-bold">
                {t('modal_maint_total_label')}
                {totalDerivation.derived && (
                  <span className="block text-[10px] font-normal text-amber-400/80 mt-0.5">
                    {t('modal_maint_total_derived_hint')}
                  </span>
                )}
              </label>
              <input
                required
                type="number"
                step="any"
                min="0"
                placeholder="0"
                readOnly={totalDerivation.derived}
                title={totalDerivation.derived ? t('modal_maint_total_derived_hint') : undefined}
                className={`w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs outline-none focus:border-amber-500 font-bold font-mono ${
                  totalDerivation.derived
                    ? 'bg-slate-900/40 text-amber-300 cursor-not-allowed'
                    : 'text-amber-400'
                }`}
                value={totalDerivation.derived ? totalDerivation.total : maintenanceForm.totalCost || ''}
                onChange={e => {
                  if (totalDerivation.derived) return;
                  const val = e.target.value;
                  setMaintenanceForm({ ...maintenanceForm, totalCost: val === '' ? 0 : Number(val) });
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_workshop')}</label>
            <input
              type="text"
              placeholder={t('ph_workshop')}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              value={maintenanceForm.workshop}
              onChange={e => setMaintenanceForm({ ...maintenanceForm, workshop: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">{t('modal_maint_next_odo')}</label>
            <input
              type="number"
              placeholder={t('ph_odo_example')}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
              value={maintenanceForm.nextDueOdometer || ''}
              onChange={e => setMaintenanceForm({ ...maintenanceForm, nextDueOdometer: Number(e.target.value) })}
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
              {editingMaintenanceId ? t('modal_maint_btn_update') : t('modal_maint_btn_save')}
            </button>
          </div>
        </form>
    </Modal>
  );
};
