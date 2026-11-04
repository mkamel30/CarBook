import React, { useState } from 'react';
import { useTranslation } from '@/i18n/context';
import { formatDate, localizedField } from '@/i18n/util';
import { isCustomItemCode } from '@/services/presets';
import { pushToast } from '@/components/ui/Toast';
import { askConfirm } from '@/components/ui/ConfirmDialog';
import { useOverlayRegistration } from '@/components/ui/useOverlayRegistration';
import { CheckCircle2, Edit3, Gauge, Calendar, Wrench, X, Check, Plus, Trash2 } from 'lucide-react';

export interface SchedulesTabProps {
  schedules: any[];
  currentOdometer?: number;
  vehicleId?: string;
  onRefresh?: () => void;
}

export const SchedulesTab: React.FC<SchedulesTabProps> = ({
  schedules,
  currentOdometer = 0,
  vehicleId,
  onRefresh,
}) => {
  const { t, lang } = useTranslation();
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    lastDoneOdometer: '' as string | number,
    lastDoneDate: '',
    intervalKm: 10000,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccessId, setActionSuccessId] = useState<string | null>(null);

  // Add custom schedule modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    titleAr: '',
    titleEn: '',
    intervalKm: 10000,
    intervalMonths: '',
  });
  const [isAdding, setIsAdding] = useState(false);

  // §4: these two sheets are hand-rolled (no useDialogBehaviour), so they opt into
  // the Back stack explicitly. Close the modal whose open-state is set.
  useOverlayRegistration(Boolean(editingSchedule), () => setEditingSchedule(null));
  useOverlayRegistration(showAddModal, () => setShowAddModal(false));

  const effectiveVehicleId = vehicleId || schedules[0]?.schedule?.vehicleId;

  const openEditModal = (item: any) => {
    setEditingSchedule(item);
    setEditForm({
      lastDoneOdometer: item.schedule.lastDoneOdometer ?? (currentOdometer || ''),
      lastDoneDate: item.schedule.lastDoneDate || new Date().toISOString().split('T')[0],
      intervalKm: item.schedule.intervalKm || 10000,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingSchedule) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingSchedule.schedule.id,
          lastDoneOdometer: editForm.lastDoneOdometer === '' ? null : Number(editForm.lastDoneOdometer),
          lastDoneDate: editForm.lastDoneDate || null,
          intervalKm: Number(editForm.intervalKm),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingSchedule(null);
        if (onRefresh) onRefresh();
      } else {
        pushToast(data.error || 'Failed to update schedule', 'error');
      }
    } catch (e: any) {
      pushToast(e.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickMarkDone = async (item: any) => {
    const scheduleId = item.schedule.id;
    const today = new Date().toISOString().split('T')[0];
    const targetOdo = currentOdometer > 0 ? currentOdometer : (item.schedule.lastDoneOdometer || 0);

    const title = localizedField(lang, item.schedule.titleAr, item.schedule.titleEn);
    const confirmMsg = t('sched_mark_done_confirm', { title, odo: targetOdo.toLocaleString() });

    const ok = await askConfirm({ title: t('alerts_btn_mark_done'), message: confirmMsg });
    if (!ok) return;

    try {
      const res = await fetch('/api/schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: scheduleId,
          lastDoneOdometer: targetOdo,
          lastDoneDate: today,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccessId(scheduleId);
        setTimeout(() => setActionSuccessId(null), 2500);
        if (onRefresh) onRefresh();
      } else {
        pushToast(data.error || 'Failed to update schedule', 'error');
      }
    } catch (e: any) {
      pushToast(e.message, 'error');
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveVehicleId) return;
    if (!addForm.titleAr.trim() || Number(addForm.intervalKm) <= 0) {
      pushToast(t('alerts_item_invalid'), 'error');
      return;
    }
    setIsAdding(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: effectiveVehicleId,
          titleAr: addForm.titleAr.trim(),
          titleEn: addForm.titleEn.trim() || addForm.titleAr.trim(),
          intervalKm: Number(addForm.intervalKm),
          intervalMonths: addForm.intervalMonths ? Number(addForm.intervalMonths) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        pushToast(t('alerts_item_added'), 'success');
        setShowAddModal(false);
        setAddForm({ titleAr: '', titleEn: '', intervalKm: 10000, intervalMonths: '' });
        if (onRefresh) onRefresh();
      } else {
        pushToast(data.error || 'Failed to add item', 'error');
      }
    } catch (err: any) {
      pushToast(err.message, 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteSchedule = async (item: any) => {
    const title = localizedField(lang, item.schedule.titleAr, item.schedule.titleEn);
    const ok = await askConfirm({
      title: t('alerts_btn_delete_item'),
      message: t('alerts_delete_item_confirm', { title }),
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/schedules?id=${item.schedule.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        pushToast(t('alerts_item_deleted'), 'success');
        if (onRefresh) onRefresh();
      } else {
        pushToast(data.error || 'Failed to delete item', 'error');
      }
    } catch (err: any) {
      pushToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-100">{t('alerts_title')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('alerts_desc')}</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {currentOdometer > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full text-xs">
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400 text-[11px]">{t('dash_stat_odo')}:</span>
              <span className="font-mono font-bold text-amber-300">
                {currentOdometer.toLocaleString()} {t('unit_km')}
              </span>
            </div>
          )}

          {effectiveVehicleId && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition active:scale-95 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('alerts_btn_add_item')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid of Schedules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {schedules.map((item, idx) => {
          const isSuccess = actionSuccessId === item.schedule.id;
          const isOverdue = item.status === 'overdue';
          const isDueSoon = item.status === 'due_soon';
          const isNeedsRecord = item.status === 'needs_record';
          const isCustom = isCustomItemCode(item.schedule.itemCode);

          return (
            <div
              key={item.schedule.id || idx}
              className={`p-4 rounded-xl border text-xs flex flex-col justify-between transition relative overflow-hidden ${
                isOverdue
                  ? 'bg-rose-950/20 border-rose-900/70 text-rose-200'
                  : isDueSoon
                  ? 'bg-amber-950/20 border-amber-900/70 text-amber-200'
                  : isNeedsRecord
                  ? 'bg-slate-950 border-amber-900/40 text-slate-300'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              <div>
                {/* Title & Badge */}
                <div className="flex justify-between items-start mb-1.5 gap-2">
                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2 flex-wrap">
                    <Wrench
                      className={`w-4 h-4 shrink-0 ${
                        isOverdue
                          ? 'text-rose-400'
                          : isDueSoon
                          ? 'text-amber-400'
                          : isNeedsRecord
                          ? 'text-amber-500/80'
                          : 'text-slate-400'
                      }`}
                    />
                    <span>{localizedField(lang, item.schedule.titleAr, item.schedule.titleEn)}</span>
                    {isCustom && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {t('alerts_item_badge_custom')}
                      </span>
                    )}
                  </h3>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${
                        isOverdue
                          ? 'bg-rose-500 text-white'
                          : isDueSoon
                          ? 'bg-amber-500 text-slate-950'
                          : isNeedsRecord
                          ? 'bg-slate-800 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {isOverdue
                        ? t('alerts_status_overdue')
                        : isDueSoon
                        ? t('alerts_status_due_soon')
                        : isNeedsRecord
                        ? t('alerts_status_needs_record')
                        : t('alerts_status_ok')}
                    </span>

                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSchedule(item)}
                        className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded transition"
                        title={t('alerts_btn_delete_item')}
                        aria-label={t('alerts_btn_delete_item')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 mb-3 pl-6">
                  {lang !== 'ar' ? item.schedule.titleAr : item.schedule.titleEn}
                </div>

                {/* Metrics */}
                <div className="bg-slate-900/60 rounded-lg p-2.5 border border-slate-800/80 space-y-1.5 mb-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t('alerts_interval')}</span>
                    <span className="font-semibold text-slate-200 font-mono">
                      {item.schedule.intervalKm?.toLocaleString()} {t('unit_km')}
                      {item.schedule.intervalMonths ? ` • ${item.schedule.intervalMonths}m` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t('alerts_last_done')}</span>
                    <span className="font-semibold text-slate-200 font-mono">
                      {item.schedule.lastDoneOdometer != null ? (
                        `${item.schedule.lastDoneOdometer.toLocaleString()} ${t('unit_km')}`
                      ) : (
                        <span className="text-amber-400/90 font-sans text-[11px] font-medium">
                          {t('alerts_last_done_none')}
                        </span>
                      )}
                    </span>
                  </div>
                  {item.schedule.lastDoneDate && (
                    <div className="flex justify-between items-center text-[11px] text-slate-400 pt-0.5 border-t border-slate-800/60">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {t('alerts_modal_date_label')}
                      </span>
                      <span className="font-mono text-slate-300">
                        {formatDate(item.schedule.lastDoneDate, lang)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Message & Linked Evidence */}
              <div className="pt-2 border-t border-slate-800/80 mb-3 font-medium">
                {isNeedsRecord ? (
                  <span className="text-amber-400/90 text-[11px] leading-relaxed block">
                    {t('alerts_needs_record_hint')}
                  </span>
                ) : lang === 'ar' ? (
                  item.alertMessageAr
                ) : isOverdue ? (
                  t('alerts_overdue_by', { km: Math.abs(item.remainingKm || 0).toLocaleString() })
                ) : isDueSoon ? (
                  t('alerts_due_soon_remaining', { km: item.remainingKm?.toLocaleString() ?? 0 })
                ) : (
                  t('alerts_good_remaining', { km: item.remainingKm?.toLocaleString() ?? 0 })
                )}

                {item.linkedFromLog && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 px-2 py-1 rounded">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {t('alerts_linked_from_log', {
                        date: item.linkedFromLog.date,
                        odo: item.linkedFromLog.odo.toLocaleString(),
                      })}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => openEditModal(item)}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 hover:border-slate-600 px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t('alerts_btn_edit_baseline')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickMarkDone(item)}
                  disabled={isSuccess}
                  className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm ${
                    isSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                  }`}
                >
                  {isSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('alerts_mark_done_success')}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('alerts_btn_mark_done')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Baseline Modal */}
      {editingSchedule && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  <span>{t('alerts_modal_edit_title')}</span>
                </h3>
                <p className="text-xs text-amber-400/90 font-medium mt-0.5">
                  {localizedField(lang, editingSchedule.schedule.titleAr, editingSchedule.schedule.titleEn)}
                </p>
              </div>
              <button
                onClick={() => setEditingSchedule(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {t('alerts_modal_odo_label')}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    placeholder={t('alerts_last_done_none')}
                    value={editForm.lastDoneOdometer}
                    onChange={(e) => setEditForm({ ...editForm, lastDoneOdometer: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-sm outline-none focus:border-amber-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-500">{t('unit_km')}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{t('sched_edit_odo_hint')}</p>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {t('alerts_modal_date_label')}
                </label>
                <input
                  type="date"
                  value={editForm.lastDoneDate}
                  onChange={(e) => setEditForm({ ...editForm, lastDoneDate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {t('alerts_modal_interval_label')}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1000"
                    step="500"
                    value={editForm.intervalKm}
                    onChange={(e) => setEditForm({ ...editForm, intervalKm: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-sm outline-none focus:border-amber-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-500">{t('unit_km')}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingSchedule(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                {t('alerts_modal_cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSubmitting}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? '...' : t('alerts_modal_save')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Schedule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>{t('alerts_add_item_title')}</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSchedule} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {t('alerts_item_title_ar_label')}
                </label>
                <input
                  required
                  type="text"
                  placeholder={t('alerts_item_title_ar_label')}
                  value={addForm.titleAr}
                  onChange={(e) => setAddForm({ ...addForm, titleAr: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {t('alerts_item_title_en_label')}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Transmission Fluid Change"
                  value={addForm.titleEn}
                  onChange={(e) => setAddForm({ ...addForm, titleEn: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    {t('alerts_item_interval_km_label')}
                  </label>
                  <input
                    required
                    type="number"
                    min="500"
                    step="500"
                    value={addForm.intervalKm}
                    onChange={(e) => setAddForm({ ...addForm, intervalKm: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    {t('alerts_item_interval_months_label')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="12"
                    value={addForm.intervalMonths}
                    onChange={(e) => setAddForm({ ...addForm, intervalMonths: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                >
                  {t('alerts_modal_cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAdding ? '...' : t('alerts_item_add')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
