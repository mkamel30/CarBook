// Integrity verification for the self-hosted APK update channel. GitHub
// publishes a sha256 digest for each release asset; the server forwards it and
// the client re-checks the downloaded bytes against it before handing the URL
// to the system browser. Only a positive mismatch is a hard failure — an
// unverifiable download (network/CORS) falls back to the TLS-protected browser
// download rather than bricking the update path.

export function normalizeSha256(digest: string | null | undefined): string | null {
  if (!digest) return null;
  const hex = String(digest).replace(/^sha256:/i, '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type IntegrityReason = 'match' | 'not_advertised' | 'mismatch' | 'unverifiable';

export interface IntegrityCheckResult {
  verified: boolean;
  reason: IntegrityReason;
}

export async function verifyApkIntegrity(opts: {
  apkUrl: string;
  expectedSha256: string | null | undefined;
  fetchFn?: typeof fetch;
}): Promise<IntegrityCheckResult> {
  const expected = normalizeSha256(opts.expectedSha256);
  if (!expected) {
    // Nothing to check against (older server, or GitHub omitted the digest):
    // treat as verified so the download path is unchanged.
    return { verified: true, reason: 'not_advertised' };
  }
  const fetchFn = opts.fetchFn ?? fetch;
  try {
    const res = await fetchFn(opts.apkUrl);
    if (!res.ok) return { verified: false, reason: 'unverifiable' };
    const actual = await sha256Hex(await res.arrayBuffer());
    if (actual !== expected) return { verified: false, reason: 'mismatch' };
    return { verified: true, reason: 'match' };
  } catch {
    return { verified: false, reason: 'unverifiable' };
  }
}
