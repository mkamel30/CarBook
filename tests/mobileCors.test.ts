import { describe, it, expect, afterAll } from 'vitest';
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
});

afterAll(() => {
  fs.rmSync(dbPath, { force: true });
});
