import React, { useState, useEffect } from 'react';
import { Globe, Check, Fuel, PlusCircle, Trash2, Settings, Bell, BellRing, UserCheck, LogOut, Palette } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { useTheme } from '@/theme/context';
import {
  checkNotificationSupport,
  requestNotificationPermission,
  sendLocalNotification,
} from '@/services/notifications';

const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
);

export interface SettingsTabProps {
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  settingsMsg: string;
  onSaveSettings: (e: React.FormEvent) => void;
  currentUser?: { id: string; email: string; name: string; picture: string | null } | null;
  onLoginGoogle?: () => void;
  onLogout?: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  setSettings,
  settingsMsg,
  onSaveSettings,
  currentUser,
  onLoginGoogle,
  onLogout,
}) => {
  const { t, lang, setLang, languages } = useTranslation();
  const { theme, setTheme, themes } = useTheme();
  const [notifStatus, setNotifStatus] = useState<{ supported: boolean; permission: string }>({
    supported: false,
    permission: 'default',
  });
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    setNotifStatus(checkNotificationSupport());
  }, []);

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifStatus(checkNotificationSupport());
    if (granted) {
      sendLocalNotification(
        lang === 'en' ? '🚗 CarBook Notifications Activated' : '🚗 تم تفعيل إشعارات CarBook',
        {
          body:
            lang === 'en'
              ? 'You will now receive alerts when maintenance service is approaching.'
              : 'ستصلك الآن تنبيهات دورية عند اقتراب مواعيد الصيانة وتغيير الزيوت.',
        }
      );
    }
  };

  const handleTestNotification = () => {
    const sent = sendLocalNotification(
      lang === 'en' ? '🔔 CarBook Service Reminder' : '🔔 تذكير صيانة من CarBook',
      {
        body:
          lang === 'en'
            ? 'Test Alert: Engine oil change recommended soon!'
            : 'إشعار تجريبي: اقترب موعد تغيير زيت المحرك وفحص الفلاتر!',
      }
    );
    if (sent) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3500);
    } else {
      alert(
        lang === 'en'
          ? 'Please enable notification permissions in your browser or device first.'
          : 'يرجى السماح بالإشعارات من إعدادات المتصفح أو الجهاز أولاً.'
      );
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Google Account & Cloud Sync Card */}
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-100">
              {lang === 'ar' ? 'حساب المستخدم والمزامنة السحابية' : lang === 'pl' ? 'Konto użytkownika i synchronizacja' : 'User Account & Cloud Sync'}
            </h2>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
              currentUser
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                currentUser ? 'bg-emerald-400' : 'bg-slate-500'
              }`}
            />
            {currentUser
              ? (lang === 'ar' ? 'مسجل الدخول' : lang === 'pl' ? 'Zalogowano' : 'Logged in')
              : (lang === 'ar' ? 'غير مسجل' : lang === 'pl' ? 'Niezalogowany' : 'Not logged in')}
          </span>
        </div>

        {currentUser ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center gap-3">
              {currentUser.picture ? (
                <img
                  src={currentUser.picture}
                  alt={currentUser.name}
                  className="w-11 h-11 rounded-full border-2 border-amber-500/40 object-cover shadow-sm"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-amber-500/20 text-amber-400 font-bold text-base flex items-center justify-center">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-sm font-bold text-slate-100">{currentUser.name}</div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">{currentUser.email}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="self-start sm:self-auto px-4 py-2 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-900 text-xs font-semibold flex items-center gap-2 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تسجيل الخروج' : lang === 'pl' ? 'Wyloguj' : 'Sign out'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              {lang === 'ar'
                ? 'قم بتسجيل الدخول بحساب Google لربط سياراتك تلقائياً بحسابك وحفظ بياناتك وسجلاتك ومزامنتها بأمان عبر السيرفر والهاتف.'
                : lang === 'pl'
                ? 'Zaloguj się kontem Google, aby powiązać pojazdy ze swoim kontem i bezpiecznie synchronizować dane między urządzeniami.'
                : 'Sign in with your Google account to associate your vehicles with your account and sync data across devices securely.'}
            </p>
            <button
              type="button"
              onClick={onLoginGoogle}
              className="bg-white hover:bg-slate-100 text-slate-900 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2.5 shadow-md active:scale-95 transition"
            >
              <GoogleIcon />
              <span>{lang === 'ar' ? 'تسجيل الدخول بحساب Google' : lang === 'pl' ? 'Zaloguj się przez Google' : 'Sign in with Google'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Language Selection Card */}
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Globe className="w-5 h-5 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-100">
            {lang === 'ar' ? 'لغة التطبيق (App Language)' : lang === 'pl' ? 'Język aplikacji' : 'App Language'}
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {lang === 'ar'
            ? 'يدعم CarBook نظام اللغات المتعددة عبر ملفات .cfg البسيطة. يمكنك التبديل بين اللغات أو إضافة لغة جديدة بسهولة.'
            : lang === 'pl'
            ? 'CarBook obsługuje wiele języków skonfigurowanych za pomocą plików .cfg. Zmień język w dowolnym momencie.'
            : 'CarBook supports multiple languages configured via simple .cfg files. Switch your language or easily drop new language files.'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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

      {/* Theme Selection Card */}
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Palette className="w-5 h-5 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-100">
            {lang === 'ar' ? 'مظهر التطبيق (Theme)' : lang === 'pl' ? 'Motyw aplikacji' : 'App Theme'}
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {lang === 'ar'
            ? 'اختر أحد المظاهر الأربعة. يتم حفظ اختيارك على هذا الجهاز ويُطبَّق فوراً على كامل التطبيق.'
            : lang === 'pl'
            ? 'Wybierz jeden z czterech motywów. Wybór jest zapisywany na tym urządzeniu i stosowany natychmiast.'
            : 'Pick one of four themes. Your choice is saved on this device and applied instantly across the app.'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {themes.map((th) => {
            const active = theme === th.code;
            return (
              <button
                key={th.code}
                type="button"
                onClick={() => setTheme(th.code)}
                aria-pressed={active}
                className={`p-3 rounded-lg border text-right transition flex items-center gap-3 ${
                  active
                    ? 'bg-amber-500/10 border-amber-500'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <span
                  className="flex shrink-0 overflow-hidden rounded-md border border-slate-700"
                  aria-hidden="true"
                >
                  {th.preview.map((c) => (
                    <span key={c} className="h-8 w-3" style={{ backgroundColor: c }} />
                  ))}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold truncate ${active ? 'text-amber-400' : 'text-slate-200'}`}>
                      {th.name}
                    </span>
                    {active && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                  </span>
                  <span className="block text-[11px] text-slate-400 leading-snug mt-0.5">{th.description}</span>
                </span>
              </button>
            );
          })}
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
              className="flex items-center gap-2 sm:gap-3 bg-slate-900/60 p-2 sm:p-2.5 rounded-lg border border-slate-800"
            >
              <input
                type="text"
                placeholder="Gasoline 95 / بنزين 95"
                className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                value={ft.name}
                onChange={(e) => {
                  const updated = [...settings.fuelTypes];
                  updated[idx].name = e.target.value;
                  setSettings({ ...settings, fuelTypes: updated });
                }}
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Price"
                  className="w-16 sm:w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-amber-500 text-center"
                  value={ft.price}
                  onChange={(e) => {
                    const updated = [...settings.fuelTypes];
                    updated[idx].price = Number(e.target.value);
                    setSettings({ ...settings, fuelTypes: updated });
                  }}
                />
                <span className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap">
                  {t('unit_currency')}/{t('unit_liter')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated = settings.fuelTypes.filter((_: any, i: number) => i !== idx);
                  setSettings({ ...settings, fuelTypes: updated });
                }}
                className="text-rose-400 hover:text-rose-300 p-1.5 hover:bg-slate-800 rounded shrink-0 transition"
                title={t('btn_delete')}
              >
                <Trash2 className="w-4 h-4" />
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

      {/* Device Notifications Card */}
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-100">{t('notif_title')}</h2>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
              notifStatus.permission === 'granted'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                notifStatus.permission === 'granted' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            {notifStatus.permission === 'granted'
              ? t('notif_status_enabled')
              : t('notif_status_disabled')}
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">{t('notif_desc')}</p>

        {testSent && (
          <div className="p-2.5 text-xs bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded-lg flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{t('notif_test_sent')}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {notifStatus.permission !== 'granted' && (
            <button
              type="button"
              onClick={handleEnableNotifications}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition active:scale-95 shadow-sm"
            >
              <BellRing className="w-4 h-4" />
              <span>{t('notif_btn_enable')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleTestNotification}
            className="bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition active:scale-95"
          >
            <Bell className="w-4 h-4 text-amber-400" />
            <span>{t('notif_btn_test')}</span>
          </button>
        </div>
      </div>

      {/* AI Provider Settings */}
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-100">{t('set_ai_title')}</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {lang === 'ar' ? 'الذكاء الاصطناعي مُدار وجاهز (مجاني 100%)' : 'AI Ready & Server Managed (100% Free)'}
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {lang === 'ar'
            ? 'تطبيق CarBook مجهّز بمحرك ذكاء اصطناعي وقاعدة بيانات هندسية مُدارة من السيرفر تعمل مجاناً وتلقائياً. إدخال مفتاح API خاص بك هو خيار إضافي اختياري تماماً.'
            : 'CarBook is equipped with a server-managed AI engine and automotive knowledge base that operates automatically for free. Providing your own API key is completely optional.'}
        </p>

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
              <option value="gemini">Google Gemini API (Default Managed)</option>
              <option value="openrouter">OpenRouter API</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {lang === 'ar' ? 'مفتاح API الخاص بك (اختياري)' : 'Personal API Key (Optional)'}{' '}
              {settings.hasApiKey && (
                <span className="text-emerald-400">
                  ({t('set_ai_key_saved')} {settings.maskedApiKey})
                </span>
              )}
            </label>
            <input
              type="password"
              placeholder={settings.hasApiKey ? t('set_ai_key_placeholder') : (lang === 'ar' ? 'اتركه فارغاً للاستخدام المجاني التلقائي أو أدخل مفتاحك' : 'Leave empty for automatic free mode, or paste custom key')}
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
