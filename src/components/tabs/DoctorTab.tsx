import React from 'react';
import { HelpCircle, Wrench, Send, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface DoctorTabProps {
  selectedVehicle: any;
  doctorQuery: string;
  setDoctorQuery: (q: string) => void;
  doctorLoading: boolean;
  doctorHistory: { query: string; advice: string }[];
  onAskDoctor: (e: React.FormEvent) => void;
}

export const DoctorTab: React.FC<DoctorTabProps> = ({
  selectedVehicle,
  doctorQuery,
  setDoctorQuery,
  doctorLoading,
  doctorHistory,
  onAskDoctor,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-amber-500" /> {t('doc_title')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('doc_desc')}</p>
        </div>
        <div className="text-xs bg-slate-950 border border-slate-800 px-3 py-1.5 rounded text-slate-300 font-mono">
          {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year}) • {t('header_odometer')}{' '}
          <span className="text-amber-400 font-bold">
            {selectedVehicle.currentOdometer.toLocaleString()} {t('unit_km')}
          </span>
        </div>
      </div>

      {/* Consultation Input Box */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
        <form onSubmit={onAskDoctor} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('doc_input_label')}
            </label>
            <textarea
              required
              rows={3}
              value={doctorQuery}
              onChange={(e) => setDoctorQuery(e.target.value)}
              placeholder={t('doc_input_placeholder')}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 outline-none focus:border-amber-500 leading-relaxed resize-none"
            />
          </div>

          {/* Quick Suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <span className="font-medium text-slate-400">{t('doc_quick_title')}</span>
            {[
              t('doc_quick_1'),
              t('doc_quick_2'),
              t('doc_quick_3'),
              t('doc_quick_4'),
            ].map((suggestion, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setDoctorQuery(suggestion)}
                className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-2.5 py-1 rounded-full transition"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={doctorLoading || !doctorQuery.trim()}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded text-xs flex items-center gap-2 transition"
            >
              {doctorLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('doc_btn_loading')}
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> {t('doc_btn_submit')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Consultation History */}
      <div className="space-y-4">
        {doctorHistory.length === 0 ? (
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-6 text-center space-y-2">
            <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-xs font-semibold text-slate-300">{t('doc_welcome_title')}</h4>
            <p className="text-[11px] text-slate-400 max-w-lg mx-auto leading-relaxed">
              {t('doc_welcome_desc')}
            </p>
          </div>
        ) : (
          doctorHistory.map((item, idx) => (
            <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
              {/* User Query */}
              <div className="flex items-start gap-2.5 bg-slate-900/70 p-3 rounded-lg border border-slate-800/70">
                <span className="text-amber-400 font-bold text-xs shrink-0">{t('doc_your_query')}</span>
                <span className="text-xs text-slate-200 leading-relaxed">{item.query}</span>
              </div>

              {/* Doctor Advice */}
              <div className="space-y-2 pr-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <Wrench className="w-3.5 h-3.5" /> {t('doc_advice_title')}
                </div>
                <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-slate-900/40 p-4 rounded-lg border border-slate-800/50">
                  {item.advice}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
