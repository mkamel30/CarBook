'use client';

import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Download, Sparkles, X } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { resolveInstalledVersion, semverToVersionCode } from '@/services/version';
import { useApkInstaller } from '@/hooks/useApkInstaller';
import { percentOf, progressKeyFor } from '@/services/apkUpdater';

interface AppVersionInfo {
  version: string;
  versionCode: number;
  apkUrl: string | null;
  /** Published digest of the APK asset; the native installer re-checks the bytes. */
  sha256?: string | null;
}

export const UpdateBanner: React.FC = () => {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // Called with the other hooks: below the early return it would be conditional.
  const installer = useApkInstaller();
  const installOutcome = installer.result?.outcome ?? null;
  const installPercent = percentOf(installer.progress);
  const installKey = progressKeyFor(installer.progress);

  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const res = await fetch('/api/app-version');
        if (!res.ok) return;
        const body = await res.json();
        const info: AppVersionInfo | undefined = body?.success ? body.data : undefined;
        if (!info?.version || !info.apkUrl) return;
        // Newer by versionCode (what Android actually uses to decide whether an
        // APK can upgrade the installed one), not by string inequality. The
        // installed version comes from the native bridge (falls back to the
        // baked constant on web), not from the bundle — otherwise a stale baked
        // constant would hide an update from an older installed APK.
        const installed = await resolveInstalledVersion(() => App.getInfo());
        const serverCode = semverToVersionCode(info.version);
        const currentCode = installed.versionCode;
        if (serverCode <= currentCode) return;
        const dismissedVersion = localStorage.getItem('carbook_dismissed_update');
        if (dismissedVersion === info.version) return;
        if (alive) setUpdateInfo(info);
      } catch {
        // Silently skip if network unreachable
      }
    }
    check();
    return () => {
      alive = false;
    };
  }, []);

  if (!updateInfo || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (updateInfo?.version) {
      localStorage.setItem('carbook_dismissed_update', updateInfo.version);
    }
  };

  // On Android the native plugin owns the download (progress, on-disk SHA-256, then
  // the installer prompt); everywhere else it falls back to the browser handoff that
  // this banner used to do unconditionally.
  const handleDownload = () => {
    const url = updateInfo?.apkUrl;
    if (!url || installer.busy) return;
    void installer.start({ apkUrl: url, sha256: updateInfo?.sha256 ?? null });
  };

  const statusLine = (() => {
    if (installOutcome === 'integrity_failed') return t('update_integrity_mismatch');
    if (installOutcome === 'permission_required') return t('update_permission_needed');
    if (installOutcome === 'failed') return t('update_download_failed');
    if (installKey === 'update_progress_verifying') return t(installKey);
    if (installKey) {
      // DownloadManager reports no total for a chunked/unknown-length asset.
      return installPercent === null ? t('update_progress_unknown') : t(installKey, { percent: `${installPercent}%` });
    }
    return null;
  })();

  return (
    <div className="bg-gradient-to-r from-amber-500/20 via-amber-600/15 to-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between gap-3 text-xs z-20">
      <div className="flex items-center gap-2.5 min-w-0">
        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
        <div className="min-w-0">
          <span className="font-bold text-amber-200">
            {t('update_available_title', { version: updateInfo.version })}:
          </span>{' '}
          {/* The generic body is desktop-only chrome, but the live install status is
              the whole point on a phone — never hide it there. */}
          <span className={statusLine ? 'text-slate-300 truncate' : 'text-slate-300 truncate hidden sm:inline'}>
            {statusLine || t('update_available_body')}
          </span>
          {installer.busy && (
            <span className="block h-1 mt-1 rounded-full bg-slate-700/60 overflow-hidden">
              <span
                className="block h-full bg-amber-400 transition-[width] duration-300"
                style={{ width: `${installPercent ?? 0}%` }}
              />
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {installOutcome === 'permission_required' && (
          <button
            type="button"
            onClick={() => void installer.openInstallPermission()}
            className="bg-slate-800 hover:bg-slate-700 text-amber-200 border border-amber-500/40 px-3 py-1 rounded-md text-xs font-bold transition active:scale-95"
          >
            {t('update_allow_install_btn')}
          </button>
        )}
        <button
          type="button"
          onClick={handleDownload}
          disabled={installer.busy}
          className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3 py-1 rounded-md text-xs flex items-center gap-1.5 transition active:scale-95 shadow-sm disabled:opacity-60"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{installer.busy && installPercent !== null ? `${installPercent}%` : t('update_btn_download')}</span>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 text-slate-400 hover:text-slate-200 rounded transition"
          title={t('update_btn_later')}
          aria-label={t('update_btn_later')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
