import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

// Routes may resolve their DB at construction time; keep this file off the
// repo working tree like the other API suites.
const dbPath = path.join(os.tmpdir(), `carbook_cors_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
process.env.CARBOOK_DB_PATH = dbPath;
process.env.JWT_SECRET = 'cors_test_secret_key_padded_for_dev_only';

import { GET as me } from '@/app/api/auth/me/route';
import { POST as tokenLogin } from '@/app/api/auth/token-login/route';

const MOBILE = 'https://localhost';

function req(url: string, init: any = {}): NextRequest {
  return new NextRequest(url, init);
}

describe('scoped mobile CORS (bundled Capacitor origin)', () => {
  it('answers preflight from the Capacitor origin without running the handler', async () => {
    const res = await me(req('https://srv/api/auth/me', { method: 'OPTIONS', headers: { origin: MOBILE } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(MOBILE);
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('refuses preflight from any other origin', async () => {
    const res = await me(req('https://srv/api/auth/me', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('tags real responses for the mobile origin and leaves web responses bare', async () => {
    const mobile = await me(req('https://srv/api/auth/me', { headers: { origin: MOBILE } }));
    expect(mobile.status).toBe(200);
    expect(mobile.headers.get('access-control-allow-origin')).toBe(MOBILE);

    const web = await me(req('https://srv/api/auth/me'));
    expect(web.status).toBe(200);
    expect(web.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('never advertises Allow-Credentials: the bearer header is the only cross-origin credential', async () => {
    const res = await tokenLogin(
      req('https://srv/api/auth/token-login', {
        method: 'OPTIONS',
        headers: { origin: MOBILE, 'access-control-request-method': 'POST' },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  // Regression guard: Next.js App Router answers OPTIONS itself (bare 204, no
  // CORS headers) unless the route EXPORTS an OPTIONS handler, so the preflight
  // never reaches withMobileCors and the WebView fetch fails opaquely. The
  // tests above call the wrapper directly and cannot catch a missing export.
  // The update check is a plain GET, so no preflight is sent — the response must
  // still carry ACAO or the WebView blocks it and Settings reports a failure the
  // server never produced. GitHub is stubbed to fail here so the route takes its
  // documented fallback branch without touching the network.
  it('tags the app-version update check for the mobile origin', async () => {
    const { GET: appVersion } = await import('@/app/api/app-version/route');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline in test'); }));
    try {
      const mobile = await appVersion(req('https://srv/api/app-version', { headers: { origin: MOBILE } }));
      expect(mobile.status).toBe(200);
      expect(mobile.headers.get('access-control-allow-origin')).toBe(MOBILE);
      expect(mobile.headers.get('access-control-allow-credentials')).toBeNull();

      const web = await appVersion(req('https://srv/api/app-version'));
      expect(web.status).toBe(200);
      expect(web.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('every mobile-facing route exports OPTIONS so preflights reach the wrapper', async () => {
    const routes = [
      '@/app/api/auth/me/route',
      '@/app/api/auth/logout/route',
      '@/app/api/auth/device/route',
      '@/app/api/auth/token-login/route',
      '@/app/api/sync/route',
      '@/app/api/ai/doctor/route',
      '@/app/api/ai/lookup/route',
      '@/app/api/ai/manual/route',
      '@/app/api/app-version/route',
    ];
    for (const spec of routes) {
      const mod = await import(spec);
      expect(typeof mod.OPTIONS, `${spec} must export OPTIONS`).toBe('function');
      const res = await mod.OPTIONS(req('https://srv/probe', { method: 'OPTIONS', headers: { origin: MOBILE } }));
      expect(res.status, `${spec} preflight status`).toBe(204);
      expect(res.headers.get('access-control-allow-origin'), `${spec} preflight ACAO`).toBe(MOBILE);
    }
  });
});

afterAll(() => {
  fs.rmSync(dbPath, { force: true });
});
