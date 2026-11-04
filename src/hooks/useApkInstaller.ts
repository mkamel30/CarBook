'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  ApkUpdaterProgress,
  RunUpdateResult,
  UpdaterPluginRef,
  runApkUpdate,
} from '@/services/apkUpdater';

/**
 * The proxy is created once per platform check, never at module scope: on the web
 * build (and during Next SSR) there is no native bridge, and calling a plugin there
 * would reject with "not implemented" instead of taking the browser path.
 */
function createAndroidUpdater(): UpdaterPluginRef | null {
  // Next prerenders these tabs in node, where there is no Capacitor global at all.
  if (typeof window === 'undefined') return null;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null;
  try {
    return registerPlugin<UpdaterPluginRef>('ApkUpdater');
  } catch {
    return null;
  }
}

export interface ApkInstallerState {
  /** False on web/iOS: callers keep their existing Browser.open behaviour there. */
  isNative: boolean;
  busy: boolean;
  progress: ApkUpdaterProgress | null;
  result: RunUpdateResult | null;
  start: (info: { apkUrl: string; sha256?: string | null }) => Promise<RunUpdateResult>;
  openInstallPermission: () => Promise<void>;
  handOffToBrowser: (url: string) => void;
}

export function useApkInstaller(): ApkInstallerState {
  const plugin = useMemo(() => createAndroidUpdater(), []);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ApkUpdaterProgress | null>(null);
  const [result, setResult] = useState<RunUpdateResult | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handOffToBrowser = useCallback((url: string) => {
    Browser.open({ url }).catch(() => {
      window.open(url, '_blank');
    });
  }, []);

  const start = useCallback(
    async (info: { apkUrl: string; sha256?: string | null }) => {
      setBusy(true);
      setResult(null);
      setProgress({ phase: 'queued', percent: 0 });
      const outcome = await runApkUpdate({
        plugin,
        apkUrl: info.apkUrl,
        expectedSha256: info.sha256 ?? null,
        onProgress: (event) => {
          if (mounted.current) setProgress(event);
        },
        onBrowserHandoff: handOffToBrowser,
      });
      if (mounted.current) {
        setResult(outcome);
        setBusy(false);
      }
      return outcome;
    },
    [handOffToBrowser, plugin],
  );

  const openInstallPermission = useCallback(async () => {
    if (!plugin) return;
    try {
      await plugin.openInstallPermissionSettings();
    } catch {
      // Some OEM builds do not expose that screen; the browser handoff already ran.
    }
  }, [plugin]);

  return {
    isNative: plugin !== null,
    busy,
    progress,
    result,
    start,
    openInstallPermission,
    handOffToBrowser,
  };
}
