import React from 'react';
import { Globe, Check, Fuel, PlusCircle, Trash2, Settings } from 'lucide-react';
import { useTranslation } from '@/i18n/context';

export interface SettingsTabProps {
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  settingsMsg: string;
  onSaveSettings: (e: React.FormEvent) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  setSettings,
  settingsMsg,
  onSaveSettings,
}) => {
  const { t, lang, setLang, languages } = useTranslation();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Language Selection Card */}
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Globe className="w-5 h-5 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-100">
            {lang === 'ar' ? 'لغة التطبيق (App Language)' : 'App Language'}
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {lang === 'ar'
            ? 'يدعم CarBook نظام اللغات المتعددة عبر ملفات .cfg البسيطة. يمكنك التبديل بين اللغات أو إضافة لغة جديدة بسهولة.'
            : 'CarBook supports multiple languages configured via simple .cfg files. Switch your language or easily drop new language files.'}
        </p>
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          {languages.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className={`p-3 rounded-lg border text-xs font-bold flex items-center justify-between transition ${
                lang === l.code
                  ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span>{l.name}</span>
              {lang === l.code && <Check className="w-4 h-4 text-amber-400" />}
            </button>
          ))}
        </div>
      </div>

      {/* Fuel Types & Pricing Settings */}
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Fuel className="w-5 h-5 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-100">{t('set_fuel_pricing_title')}</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{t('set_fuel_pricing_desc')}</p>

        <div className="space-y-3">
          {settings.fuelTypes?.map((ft: any, idx: number) => (
            <div
              key={ft.id || idx}
              className="flex items-center gap-3 bg-slate-900/60 p-2.5 rounded border border-slate-800"
            >
              <input
                type="text"
                placeholder="Gasoline 95 / بنزين 95"
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                value={ft.name}
                onChange={(e) => {
                  const updated = [...settings.fuelTypes];
                  updated[idx].name = e.target.value;
                  setSettings({ ...settings, fuelTypes: updated });
                }}
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Price"
                  className="w-24 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-amber-500 text-center"
                  value={ft.price}
                  onChange={(e) => {
                    const updated = [...settings.fuelTypes];
                    updated[idx].price = Number(e.target.value);
                    setSettings({ ...settings, fuelTypes: updated });
                  }}
                />
                <span className="text-xs text-slate-400">
                  {t('unit_currency')}/{t('unit_liter')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated = settings.fuelTypes.filter((_: any, i: number) => i !== idx);
                  setSettings({ ...settings, fuelTypes: updated });
                }}
                className="text-rose-400 hover:text-rose-300 p-1 hover:bg-slate-800 rounded"
                title={t('btn_delete')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => {
              const newId = `fuel_${Date.now()}`;
              setSettings({
                ...settings,
                fuelTypes: [
                  ...settings.fuelTypes,
                  {
                    id: newId,
                    name: lang === 'en' ? 'New Fuel Grade' : 'نوع وقود جديد',
                    price: 15.0,
                  },
                ],
              });
            }}
            className="text-xs text-amber-500 hover:text-amber-400 font-medium flex items-center gap-1 py-1"
          >
            <PlusCircle className="w-3.5 h-3.5" /> {t('set_fuel_add_btn')}
          </button>
        </div>
      </div>

      {/* AI Provider Settings */}
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Settings className="w-5 h-5 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-100">{t('set_ai_title')}</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{t('set_ai_desc')}</p>

        {settingsMsg && (
          <div className="p-2 text-xs bg-emerald-950 border border-emerald-800 text-emerald-300 rounded">
            {t('set_save_success')}
          </div>
        )}

        <form onSubmit={onSaveSettings} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">{t('set_ai_provider')}</label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
              value={settings.provider}
              onChange={(e) => setSettings((prev: any) => ({ ...prev, provider: e.target.value }))}
            >
              <option value="gemini">Google Gemini API</option>
              <option value="openrouter">OpenRouter API</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t('set_ai_key_label')}{' '}
              {settings.hasApiKey && (
                <span className="text-emerald-400">
                  ({t('set_ai_key_saved')} {settings.maskedApiKey})
                </span>
              )}
            </label>
            <input
              type="password"
              placeholder={settings.hasApiKey ? t('set_ai_key_placeholder') : 'sk-or-v1-... or AIzaSy...'}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
              value={settings.apiKey}
              onChange={(e) => setSettings((prev: any) => ({ ...prev, apiKey: e.target.value }))}
            />
          </div>

          <button
            type="submit"
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs transition"
          >
            {t('set_save_btn')}
          </button>
        </form>
      </div>
    </div>
  );
};
