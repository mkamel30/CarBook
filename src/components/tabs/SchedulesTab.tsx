import React, { useState } from 'react';
import { useTranslation } from '@/i18n/context';
import { CheckCircle2, Edit3, Gauge, Calendar, Wrench, X, Check } from 'lucide-react';

export interface SchedulesTabProps {
  schedules: any[];
  currentOdometer?: number;
  onRefresh?: () => void;
}

export const SchedulesTab: React.FC<SchedulesTabProps> = ({
  schedules,
  currentOdometer = 0,
  onRefresh,
}) => {
  const { t, lang } = useTranslation();
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    lastDoneOdometer: 0,
    lastDoneDate: '',
    intervalKm: 10000,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccessId, setActionSuccessId] = useState<string | null>(null);

  const openEditModal = (item: any) => {
    setEditingSchedule(item);
    setEditForm({
      lastDoneOdometer: item.schedule.lastDoneOdometer || currentOdometer,
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
          lastDoneOdometer: Number(editForm.lastDoneOdometer),
          lastDoneDate: editForm.lastDoneDate,
          intervalKm: Number(editForm.intervalKm),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingSchedule(null);
        if (onRefresh) onRefresh();
      } else {
        alert(data.error || 'Failed to update schedule');
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickMarkDone = async (item: any) => {
    const scheduleId = item.schedule.id;
    const today = new Date().toISOString().split('T')[0];
    const targetOdo = currentOdometer > 0 ? currentOdometer : (item.schedule.lastDoneOdometer || 0);

    const title = lang !== 'ar' ? item.schedule.titleEn : item.schedule.titleAr;
    const confirmMsg = lang !== 'ar'
      ? `Mark "${title}" as completed at ${targetOdo.toLocaleString()} km today?`
      : `هل تود تأكيد إتمام صيـانة "${title}" الآن عند قراءة العداد: ${targetOdo.toLocaleString()} كم؟`;

    if (!window.confirm(confirmMsg)) return;

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
        alert(data.error || 'Failed to update schedule');
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-100">{t('alerts_title')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('alerts_desc')}</p>
        </div>
        {currentOdometer > 0 && (
          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full text-xs">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400 text-[11px]">{t('dash_stat_odo')}:</span>
            <span className="font-mono font-bold text-amber-300">{currentOdometer.toLocaleString()} {t('unit_km')}</span>
          </div>
        )}
      </div>

      {/* Grid of Schedules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {schedules.map((item, idx) => {
          const isSuccess = actionSuccessId === item.schedule.id;
          const isOverdue = item.status === 'overdue';
          const isDueSoon = item.status === 'due_soon';

          return (
            <div
              key={item.schedule.id || idx}
              className={`p-4 rounded-xl border text-xs flex flex-col justify-between transition relative overflow-hidden ${
                isOverdue
                  ? 'bg-rose-950/20 border-rose-900/70 text-rose-200'
                  : isDueSoon
                  ? 'bg-amber-950/20 border-amber-900/70 text-amber-200'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}
            >
              <div>
                {/* Title & Badge */}
                <div className="flex justify-between items-start mb-1.5 gap-2">
                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                    <Wrench className={`w-4 h-4 shrink-0 ${isOverdue ? 'text-rose-400' : isDueSoon ? 'text-amber-400' : 'text-slate-400'}`} />
                    <span>{lang !== 'ar' ? item.schedule.titleEn || item.schedule.titleAr : item.schedule.titleAr}</span>
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 shadow-sm ${
                      isOverdue
                        ? 'bg-rose-500 text-white'
                        : isDueSoon
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {isOverdue
                      ? t('alerts_status_overdue')
                      : isDueSoon
                      ? t('alerts_status_due_soon')
                      : t('alerts_status_ok')}
                  </span>
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
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t('alerts_last_done')}</span>
                    <span className="font-semibold text-slate-200 font-mono">
                      {item.schedule.lastDoneOdometer?.toLocaleString() || 0} {t('unit_km')}
                    </span>
                  </div>
                  {item.schedule.lastDoneDate && (
                    <div className="flex justify-between items-center text-[11px] text-slate-400 pt-0.5 border-t border-slate-800/60">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {t('alerts_modal_date_label')}
                      </span>
                      <span className="font-mono text-slate-300">{item.schedule.lastDoneDate}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Message */}
              <div className="pt-2 border-t border-slate-800/80 mb-3 font-medium">
                {lang !== 'ar'
                  ? isOverdue
                    ? `⚠️ Overdue by ${Math.abs(item.remainingKm || 0).toLocaleString()} km!`
                    : isDueSoon
                    ? `⏳ Due soon (${item.remainingKm?.toLocaleString()} km remaining)`
                    : `✅ Good condition (${item.remainingKm?.toLocaleString()} km remaining)`
                  : item.alertMessageAr}
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
                      <span>تم بنجاح!</span>
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
                  {lang !== 'ar'
                    ? editingSchedule.schedule.titleEn || editingSchedule.schedule.titleAr
                    : editingSchedule.schedule.titleAr}
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
                    value={editForm.lastDoneOdometer}
                    onChange={(e) => setEditForm({ ...editForm, lastDoneOdometer: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-sm outline-none focus:border-amber-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-500">{t('unit_km')}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {lang !== 'ar'
                    ? 'Enter the car odometer reading when this service was last performed.'
                    : 'أدخل قراءة عداد السيارة عند آخر مرة قمت فيها بعمل هذه الصيانة.'}
                </p>
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
    </div>
  );
};
