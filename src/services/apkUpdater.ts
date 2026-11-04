// Client-side logic for the native update installer (android/app/src/main/java/
// com/mkamel/carbook/ApkUpdater.java). Kept free of any @capacitor/core import so it
// stays loadable from node/vitest, exactly like services/version.ts injects its
// getInfo seam: the hook passes the real plugin proxy, the tests pass a fake.

export interface ApkUpdaterProgress {
  phase: string;
  percent?: number;
  totalBytes?: number;
  /** DownloadManager COLUMN_REASON, present only when phase is 'failed'. */
  reason?: number;
}

export interface ApkInstallResult extends ApkUpdaterProgress {
  path?: string;
  fileName?: string;
  sizeBytes?: number;
  sha256?: string;
  /** True when the server advertised a digest and the file matched it. */
  verified?: boolean;
  canInstall?: boolean;
  installLaunched?: boolean;
  installError?: string;
}

export interface UpdaterPluginRef {
  downloadAndInstall(opts: {
    url: string;
    expectedSha256?: string | null;
    autoInstall?: boolean;
    fileName?: string;
  }): Promise<ApkInstallResult>;
  canRequestInstall(): Promise<{ allowed: boolean; needsPermission?: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  addListener(
    name: 'progress',
    callback: (event: ApkUpdaterProgress) => void,
  ): Promise<{ remove: () => unknown }>;
}

/**
 * What the UI has to do next. Every value maps to one visible behaviour, so a new
 * native failure mode cannot silently fall through to "just open the browser".
 */
export type UpdateOutcome =
  | 'install_prompt'
  | 'downloaded'
  | 'permission_required'
  | 'integrity_failed'
  | 'failed'
  | 'browser_handoff';

export interface UpdateErrorShape {
  code?: string;
  message?: string;
}

/**
 * Maps a resolved install or a rejection onto an outcome. A hard integrity failure
 * is kept distinct from a transport failure: the first means the bytes are not what
 * the release published, the second just means "try again".
 */
export function classifyInstall(result: ApkInstallResult | null, error: UpdateErrorShape | null): UpdateOutcome {
  if (error) {
    const code = (error.code || '').toUpperCase();
    if (code === 'SHA256_MISMATCH') return 'integrity_failed';
    return 'failed';
  }
  if (!result) return 'failed';
  if (result.installLaunched) return 'install_prompt';
  if (result.canInstall === false) return 'permission_required';
  return 'downloaded';
}

/**
 * Only these outcomes still want the browser handoff. Integrity failures never get
 * it: opening the same URL in a browser would download the very bytes we refused,
 * past the check that caught them.
 */
export function shouldHandOffToBrowser(outcome: UpdateOutcome): boolean {
  return outcome === 'failed' || outcome === 'permission_required';
}

/** One progress event into the strings the tab renders; unknown phases stay neutral. */
export function progressKeyFor(event: ApkUpdaterProgress | null): string | null {
  if (!event) return null;
  switch (event.phase) {
    case 'queued':
    case 'downloading':
      return 'update_progress_downloading';
    case 'paused':
      return 'update_progress_paused';
    case 'verifying':
      return 'update_progress_verifying';
    case 'install_prompt':
    case 'downloaded':
      return null;
    default:
      return 'update_progress_downloading';
  }
}

export function percentOf(event: ApkUpdaterProgress | null): number | null {
  if (!event) return null;
  const raw = Number(event.percent);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export interface RunUpdateDeps {
  plugin: UpdaterPluginRef | null;
  apkUrl: string;
  expectedSha256?: string | null;
  onProgress?: (event: ApkUpdaterProgress) => void;
  /** Called for 'browser_handoff' and for the outcomes that offer it as an escape. */
  onBrowserHandoff: (url: string) => void;
}

export interface RunUpdateResult {
  outcome: UpdateOutcome;
  detail: ApkInstallResult | null;
  error: UpdateErrorShape | null;
}

/**
 * Runs the whole update transport. The plugin owns download, on-disk hashing and the
 * installer intent; this function owns the decision tree, including the case where
 * there is no native plugin at all (web build) — then the browser handoff is the
 * entire behaviour, unchanged from before.
 */
export async function runApkUpdate(deps: RunUpdateDeps): Promise<RunUpdateResult> {
  const { plugin, apkUrl, expectedSha256 = null, onProgress, onBrowserHandoff } = deps;

  if (!plugin) {
    onBrowserHandoff(apkUrl);
    return { outcome: 'browser_handoff', detail: null, error: null };
  }

  let subscription: { remove: () => unknown } | null = null;
  if (onProgress) {
    try {
      subscription = await plugin.addListener('progress', onProgress);
    } catch {
      // Progress is cosmetic; a missing listener must not abort a real download.
      subscription = null;
    }
  }

  try {
    const result = await plugin.downloadAndInstall({
      url: apkUrl,
      expectedSha256,
      autoInstall: true,
    });
    const outcome = classifyInstall(result, null);
    if (shouldHandOffToBrowser(outcome)) onBrowserHandoff(apkUrl);
    return { outcome, detail: result, error: null };
  } catch (raw: any) {
    const error: UpdateErrorShape = {
      code: typeof raw?.code === 'string' ? raw.code : undefined,
      message: typeof raw?.message === 'string' ? raw.message : String(raw ?? ''),
    };
    const outcome = classifyInstall(null, error);
    if (shouldHandOffToBrowser(outcome)) onBrowserHandoff(apkUrl);
    return { outcome, detail: null, error };
  } finally {
    try {
      subscription?.remove();
    } catch {
      // listener already gone
    }
  }
}
