'use client';

import React, { useEffect, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { Download, Sparkles, X } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { resolveInstalledVersion, semverToVersionCode } from '@/services/version';

interface AppVersionInfo {
  version: string;
  versionCode: number;
  apkUrl: string | null;
}

export const UpdateBanner: React.FC = () => {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

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

  // Browser.open routes through the system browser on Android (so the APK can
  // actually be downloaded and installed) and window.open on the web.
  const handleDownload = () => {
    const url = updateInfo?.apkUrl;
    if (url) {
      Browser.open({ url }).catch(() => {
        window.open(url, '_blank');
      });
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-500/20 via-amber-600/15 to-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between gap-3 text-xs z-20">
      <div className="flex items-center gap-2.5 min-w-0">
        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
        <div className="min-w-0">
          <span className="font-bold text-amber-200">
            {t('update_available_title', { version: updateInfo.version })}:
          </span>{' '}
          <span className="text-slate-300 truncate hidden sm:inline">
            {t('update_available_body')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleDownload}
          className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3 py-1 rounded-md text-xs flex items-center gap-1.5 transition active:scale-95 shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t('update_btn_download')}</span>
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
