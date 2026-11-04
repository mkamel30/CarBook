import { NextRequest, NextResponse } from 'next/server';
import pkg from '../../../../package.json';
import { semverToVersionCode } from '@/services/version';
import { mobilePreflight, withMobileCors } from '@/services/mobileCors';
import { normalizeSha256 } from '@/services/apkIntegrity';

// Latest release is read from GitHub Releases so the self-hosted server never
// needs a manual APK upload: the release workflow publishes the APK and this
// route points the app at it. Repo is overridable per deployment.
const GITHUB_REPO = process.env.GITHUB_REPO || 'mkamel30/CarBook';
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface AppVersionInfo {
  version: string;
  versionCode: number;
  apkUrl: string | null;
  /** Lowercase hex sha256 of the APK asset (from GitHub's digest), or null. */
  sha256: string | null;
  releaseDate: string | null;
  notes: string | null;
  source: 'github' | 'fallback';
}

let cache: { payload: AppVersionInfo; at: number } | null = null;

async function fetchLatestRelease(): Promise<AppVersionInfo | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CarBook' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const release = await res.json();
    const tag = String(release.tag_name || '').replace(/^v/, '');
    const apk = (release.assets || []).find((a: any) => String(a.name || '').endsWith('.apk'));
    if (!tag) return null;
    return {
      version: tag,
      versionCode: semverToVersionCode(tag),
      apkUrl: apk ? apk.browser_download_url : null,
      sha256: apk ? normalizeSha256(apk.digest) : null,
      releaseDate: release.published_at || null,
      notes: release.body || release.name || null,
      source: 'github',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function GETHandler(_req: NextRequest) {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ success: true, data: cache.payload });
  }

  const latest = await fetchLatestRelease();
  if (latest) {
    cache = { payload: latest, at: now };
    return NextResponse.json({ success: true, data: latest });
  }

  // GitHub unreachable: report the running version with no download URL, so the
  // client stays "up to date" instead of erroring out.
  const fallback: AppVersionInfo = {
    version: pkg.version || '1.0.0',
    versionCode: semverToVersionCode(pkg.version),
    apkUrl: null,
    sha256: null,
    releaseDate: null,
    notes: null,
    source: 'fallback',
  };
  return NextResponse.json({ success: true, data: fallback });
}

// The bundled APK reads this from Capacitor's `https://localhost`, so an
// untagged response is blocked by the WebView and Settings reports "could not
// check for an update" even though the server answered 200.
export const GET = withMobileCors(GETHandler);
export const OPTIONS = mobilePreflight;
