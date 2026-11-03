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
// "version" (see docs/DEPLOYMENT.md release runbook).
export const CURRENT_CLIENT_VERSION = '1.0.1';
