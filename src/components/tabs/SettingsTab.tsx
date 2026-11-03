import React, { useState, useEffect } from 'react';
import { Globe, Check, Fuel, PlusCircle, Trash2, Settings, Bell, BellRing, UserCheck, LogOut, Palette, DatabaseBackup, Download, Upload, MapPin, Sparkles } from 'lucide-react';
import { detectCountryFromTimezone, getFuelPresetsByCountry, listSupportedCountries } from '@/services/geoPricing';
import { useTranslation } from '@/i18n/context';
import { localizedField } from '@/i18n/util';
import { useTheme } from '@/theme/context';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { pushToast } from '@/components/ui/Toast';
import { Browser } from '@capacitor/browser';
import { CURRENT_CLIENT_VERSION, semverToVersionCode } from '@/services/version';
import {
  checkNotificationSupport,
  checkNotificationSupportAsync,
  requestNotificationPermission,
  sendLocalNotification,
  type NotificationStatus,
} from '@/services/notifications';

export interface SettingsTabProps {
  settings: any;
  setSettings: React.Dispatch<React.SetStateAction<any>>;
  settingsMsg: string;
  /** Failed saves render in red here — a failed save must never say success. */
  settingsError: string;
  onSaveSettings: (e: React.FormEvent) => void;
  currentUser?: { id: string; email: string; name: string; picture: string | null } | null;
  onLoginGoogle?: () => void;
  onLogout?: () => void;
  onDataRestored?: () => void;
}

interface BackupPreview {
  exportedAt: string;
  counts: Record<string, number>;
  file: unknown;
}

const BACKUP_TABLES: Array<[string, string]> = [
  ['vehicles', 'set_backup_tbl_vehicles'],
  ['maintenance_schedules', 'set_backup_tbl_schedules'],
  ['maintenance_logs', 'set_backup_tbl_service_logs'],
  ['fuel_logs', 'set_backup_tbl_fuel_logs'],
];

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  setSettings,
  settingsMsg,
  settingsError,
  onSaveSettings,
  currentUser,
  onLoginGoogle,
  onLogout,
  onDataRestored,
}) => {
  const { t, lang, setLang, languages } = useTranslation();
  const { theme, setTheme, themes } = useTheme();
  const [notifStatus, setNotifStatus] = useState<NotificationStatus>({
    supported: false,
    permission: 'default',
  });
  const [testSent, setTestSent] = useState(false);
  const [backupBusy, setBackupBusy] = useState<'export' | 'restore' | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [backupMsg, setBackupMsg] = useState('');
  const [backupError, setBackupError] = useState('');
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [replaceArmed, setReplaceArmed] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');
  const [selectedCountryCode, setSelectedCountryCode] = useState('EG');

  const handleAutoDetectFuel = () => {
    const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
    const code = detectCountryFromTimezone(tz);
    const preset = getFuelPresetsByCountry(code);
    setSelectedCountryCode(code);
    setSettings({
      ...settings,
      fuelTypes: preset.fuelTypes,
    });
    setGeoMsg(`${preset.flag} ${localizedField(lang, preset.nameAr, preset.nameEn)} (${preset.currencySymbol})`);
    setTimeout(() => setGeoMsg(''), 4000);
  };

  const handleSelectCountryPreset = (code: string) => {
    setSelectedCountryCode(code);
    const preset = getFuelPresetsByCountry(code);
    setSettings({
      ...settings,
      fuelTypes: preset.fuelTypes,
    });
    setGeoMsg(`${preset.flag} ${localizedField(lang, preset.nameAr, preset.nameEn)} (${preset.currencySymbol})`);
    setTimeout(() => setGeoMsg(''), 4000);
  };

  const handleExportBackup = async () => {
    setBackupBusy('export');
    setBackupError('');
    try {
      const res = await fetch('/api/backup');
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carbook-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setBackupError(e.message);
    } finally {
      setBackupBusy(null);
    }
  };

  const handlePickBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const [file] = e.target.files ?? [];
    setBackupPreview(null);
    setBackupMsg('');
    setBackupError('');
    setRestoreMode('merge');
    setReplaceArmed(false);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.kind !== 'carbook-backup') throw new Error(t('set_backup_unrecognised_file'));
      const counts: Record<string, number> = {};
      for (const [key] of BACKUP_TABLES) {
        counts[key] = Array.isArray(parsed.tables?.[key]) ? parsed.tables[key].length : 0;
      }
      setBackupPreview({ exportedAt: String(parsed.exportedAt ?? ''), counts, file: parsed });
    } catch (err: any) {
      setBackupError(err.message);
    }
  };

  const handleRestoreBackup = async () => {
    if (!backupPreview) return;
    setBackupBusy('restore');
    setBackupError('');
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: backupPreview.file, mode: restoreMode }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      const inserted = Object.values(json.data.tables as Record<string, { inserted: number }>)
        .reduce((n, s) => n + s.inserted, 0);
      setBackupMsg(t('set_backup_restored', { count: inserted }));
      setBackupPreview(null);
      setReplaceArmed(false);
      onDataRestored?.();
    } catch (e: any) {
      setBackupError(e.message);
    } finally {
      setBackupBusy(null);
    }
  };

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<{ version: string; apkUrl: string } | null>(null);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatusMsg(null);
    try {
      const res = await fetch('/api/app-version');
      const body = await res.json();
      const info = body?.success ? body.data : null;
      if (info?.version) {
        const serverCode = semverToVersionCode(info.version);
        const currentCode = semverToVersionCode(CURRENT_CLIENT_VERSION);
        if (serverCode > currentCode && info.apkUrl) {
          setAvailableUpdate(info);
          setUpdateStatusMsg(t('update_available_title', { version: info.version }));
        } else {
          setAvailableUpdate(null);
          setUpdateStatusMsg(t('update_up_to_date', { version: info.version }));
        }
      } else {
        setUpdateStatusMsg(t('update_check_failed'));
      }
    } catch {
      setUpdateStatusMsg(t('update_check_failed'));
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    checkNotificationSupportAsync().then(setNotifStatus);
  }, []);

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    const status = await checkNotificationSupportAsync();
    setNotifStatus(status);
    if (granted) {
      sendLocalNotification(t('set_enable_notif_title'), { body: t('set_enable_notif_body') });
    }
  };

  const handleTestNotification = () => {
    const sent = sendLocalNotification(t('set_test_notif_sent_title'), { body: t('set_test_notif_sent_body') });
    if (sent) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3500);
    } else {
      pushToast(t('set_notif_perm_hint'), 'error');
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
              {t('set_account_title')}
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
            {currentUser ? t('set_logged_in') : t('set_not_logged_in')}
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
              <span>{t('set_sign_out')}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('set_login_desc')}
            </p>
            <button
              type="button"
              onClick={onLoginGoogle}
              className="bg-white hover:bg-slate-100 text-slate-900 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2.5 shadow-md active:scale-95 transition"
            >
              <GoogleIcon />
              <span>{t('btn_login_google')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Data Backup & Restore Card */}
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <DatabaseBackup className="w-5 h-5 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-100">
            {t('set_backup_title')}
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {t('set_backup_desc')}
        </p>

        <button
          type="button"
          disabled={!currentUser || backupBusy === 'export'}
          onClick={handleExportBackup}
          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition active:scale-95"
        >
          <Download className="w-4 h-4" />
          <span>{t('set_backup_download')}</span>
        </button>

        {!currentUser && (
          <p className="text-[11px] text-slate-500">
            {t('set_backup_login_first')}
          </p>
        )}

        {currentUser && (
          <div className="space-y-3 pt-1 border-t border-slate-800">
            <label className="block text-xs font-medium text-slate-300">
              {t('set_backup_restore_from_file')}
            </label>
            <input
              type="file"
              accept="application/json,.json"
              onChange={handlePickBackupFile}
              className="block w-full text-xs text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-200 hover:file:bg-slate-700"
            />

            {backupPreview && (
              <div className="space-y-3 bg-slate-900/70 border border-slate-800 p-3 rounded-lg">
                <div className="text-[11px] text-slate-400 font-mono">
                  {backupPreview.exportedAt ? backupPreview.exportedAt.slice(0, 10) : '—'} ·{' '}
                  {BACKUP_TABLES.map(([key, labelKey]) => `${t(labelKey)}: ${backupPreview.counts[key] ?? 0}`).join(' · ')}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(['merge', 'replace'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setRestoreMode(m)}
                      aria-pressed={restoreMode === m}
                      className={`p-2.5 rounded-lg border text-right transition ${
                        restoreMode === m
                          ? 'bg-amber-500/10 border-amber-500'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className={`block text-xs font-bold ${restoreMode === m ? 'text-amber-400' : 'text-slate-200'}`}>
                        {m === 'merge' ? t('set_backup_merge_title') : t('set_backup_replace_title')}
                      </span>
                      <span className="block text-[11px] text-slate-400 leading-snug mt-0.5">
                        {m === 'merge' ? t('set_backup_merge_desc') : t('set_backup_replace_desc')}
                      </span>
                    </button>
                  ))}
                </div>

                {restoreMode === 'replace' && (
                  <label className="flex items-start gap-2 text-[11px] text-rose-300 leading-snug">
                    <input
                      type="checkbox"
                      checked={replaceArmed}
                      onChange={(e) => setReplaceArmed(e.target.checked)}
                      className="mt-0.5 accent-rose-500"
                    />
                    <span>
                      {t('set_backup_replace_ack')}
                    </span>
                  </label>
                )}

                {backupError && <div className="text-[11px] text-rose-400">{backupError}</div>}

                <button
                  type="button"
                  disabled={backupBusy === 'restore' || (restoreMode === 'replace' && !replaceArmed)}
                  onClick={handleRestoreBackup}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 border border-slate-700 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition active:scale-95"
                >
                  <Upload className="w-4 h-4" />
                  <span>{t('set_backup_restore_btn')}</span>
                </button>
              </div>
            )}

            {backupMsg && (
              <div className="p-2.5 text-xs bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded-lg flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{backupMsg}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Language Selection Card */}
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Globe className="w-5 h-5 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-100">
            {t('set_lang_title')}
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {t('set_lang_desc')}
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
            {t('set_theme_title')}
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {t('set_theme_desc')}
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

        {/* Quick Country Presets & Auto-detection */}
        <div className="bg-slate-900/60 p-3.5 rounded-lg border border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" /> {t('country_select_label')}
            </span>
            <button
              type="button"
              onClick={handleAutoDetectFuel}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-medium transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t('detect_fuel_prices_btn')}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedCountryCode}
              onChange={(e) => handleSelectCountryPreset(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
            >
              {listSupportedCountries().map((c) => (
                <option key={c.countryCode} value={c.countryCode}>
                  {c.flag} {localizedField(lang, c.nameAr, c.nameEn)} ({c.currencySymbol} - {c.currency})
                </option>
              ))}
            </select>
          </div>

          {geoMsg && (
            <div className="text-[11px] text-emerald-400 bg-emerald-950/30 p-2 rounded border border-emerald-900/40 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>{t('detect_fuel_prices_success')}: <strong>{geoMsg}</strong></span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {settings.fuelTypes?.map((ft: any, idx: number) => (
            <div
              key={ft.id || idx}
              className="flex items-center gap-2 sm:gap-3 bg-slate-900/60 p-2 sm:p-2.5 rounded-lg border border-slate-800"
            >
              <input
                type="text"
                placeholder={t('set_fuel_name_placeholder')}
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
                  placeholder={t('ph_price')}
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
                    name: t('set_new_fuel_name'),
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
              ? (notifStatus.isNative ? t('notif_status_native') : t('notif_status_enabled'))
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
              <span>{notifStatus.isNative ? t('notif_btn_enable_system') : t('notif_btn_enable')}</span>
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
            {t('set_ai_badge')}
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {t('set_ai_desc')}
        </p>

        {settingsMsg && (
          <div className="p-2 text-xs bg-emerald-950 border border-emerald-800 text-emerald-300 rounded">
            {t('set_save_success')}
          </div>
        )}
        {settingsError && (
          <div className="p-2 text-xs bg-rose-950 border border-rose-800 text-rose-300 rounded" role="alert">
            {settingsError}
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
              {t('set_api_key_label')}{' '}
              {settings.hasApiKey && (
                <span className="text-emerald-400">
                  ({t('set_ai_key_saved')} {settings.maskedApiKey})
                </span>
              )}
            </label>
            <input
              type="password"
              placeholder={settings.hasApiKey ? t('set_ai_key_placeholder') : t('set_api_key_placeholder')}
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

      {/* App Version & APK Updates Card */}
      <div className="bg-slate-950 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-100">
              {t('update_current_version', { version: CURRENT_CLIENT_VERSION })}
            </h2>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          {updateStatusMsg || t('update_available_body')}
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className="bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>{checkingUpdate ? '...' : t('update_check_btn')}</span>
          </button>

          {availableUpdate && (
            <button
              type="button"
              onClick={() =>
                Browser.open({ url: availableUpdate.apkUrl }).catch(() =>
                  window.open(availableUpdate.apkUrl, '_blank'),
                )
              }
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition active:scale-95 shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>{t('update_btn_download')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
