// Shared version helpers. The single source of truth for a released version is
// root package.json "version"; android/app/build.gradle derives versionName and
// versionCode (major*10000 + minor*100 + patch) from it. This module mirrors that
// formula on the JS side so the client can decide whether a server-reported
// release is actually newer than the running build.
export function semverToVersionCode(version: string | null | undefined): number {
  if (!version) return 0;
  const parts = String(version)
    .replace(/[^0-9.].*$/, '')
    .split('.')
    .map((p) => parseInt(p, 10));
  const major = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
  return major * 10000 + minor * 100 + patch;
}

// The version baked into the running client. Bump together with package.json
// "version" (see docs/DEPLOYMENT.md release runbook). It remains the fallback for
// the web build and for any environment where the native bridge is unavailable.
export const CURRENT_CLIENT_VERSION = '1.3.0';

export interface InstalledVersionInfo {
  version: string;
  versionCode: number;
  /** 'native' when read from the installed APK, 'baked' when it fell back. */
  source: 'native' | 'baked';
}

/**
 * The version actually installed, not the one baked into the bundle. A stale
 * baked constant would report "up to date" against an older APK the user kept
 * after a failed self-update; Android's own install gate uses the real
 * versionCode, so the client must too.
 *
 * The `getInfo` seam is injected by the caller (the @capacitor/app import lives
 * in the client components) so this module stays importable from node/vitest.
 */
export async function resolveInstalledVersion(
  getInfo: () => Promise<{ version?: string }>,
): Promise<InstalledVersionInfo> {
  try {
    const info = await getInfo();
    const version = info?.version?.trim();
    if (version) {
      return { version, versionCode: semverToVersionCode(version), source: 'native' };
    }
  } catch {
    // Native bridge unavailable (web, tests, or an old WebView): the baked
    // constant is still a correct, deterministic fallback.
  }
  return {
    version: CURRENT_CLIENT_VERSION,
    versionCode: semverToVersionCode(CURRENT_CLIENT_VERSION),
    source: 'baked',
  };
}

