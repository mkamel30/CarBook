import { describe, it, expect } from 'vitest';
import {
  AUTH_CODE_PARAM,
  createBearerFetch,
  decodeTokenExpiryMs,
  exchangeAuthCode,
  isBearerExpired,
  isServerApiUrl,
  parseAuthCode,
  runAccountHandoff,
  type AccountBearer,
  type BearerStore,
  type HandoffOutcome,
} from './authBridge';
import type { DeviceIdStore } from '@device/runtime';
import { SessionAuthError, type SessionStore, type StoredSession } from '@device/session';

// Task #17, client half: the offline -> account bearer bridge. Everything the
// bridge touches (network, the bearer store, the device session, the clock) is
// injected, so the whole state machine runs under plain node vitest — no
// WebView, no server.

const SERVER = 'https://carbook.example.test';
const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** A structurally real session JWT (3 parts, numeric exp) — signature is opaque. */
function jwt(expMs: number, extra: Record<string, unknown> = {}): string {
  const payload = { id: 'acct-1', email: 'a@example.com', name: 'A', exp: Math.floor(expMs / 1000), ...extra };
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

function memoryBearerStore(initial: AccountBearer | null = null): BearerStore & { value: AccountBearer | null } {
  const store = {
    value: initial,
    async load() {
      return store.value;
    },
    async save(bearer: AccountBearer) {
      store.value = bearer;
    },
    async clear() {
      store.value = null;
    },
  };
  return store;
}

function memorySessionStore(initial: StoredSession | null = null): SessionStore & { value: StoredSession | null } {
  const now = Date.now();
  const store = {
    value: initial,
    async load() {
      return store.value;
    },
    async save(session: StoredSession) {
      store.value = session;
    },
    async clear() {
      store.value = null;
    },
  };
  return store;
}

function memoryDeviceIdStore(id: string | null = 'device-1'): DeviceIdStore & { value: string | null } {
  const store = {
    value: id,
    async load() {
      return store.value;
    },
    async save(next: string) {
      store.value = next;
    },
  };
  return store;
}

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/** `routes` maps "METHOD pathname" -> Response factory; unmatched calls 404. */
function fakeFetch(routes: Record<string, (req: Recorded) => Response>): {
  fetch: typeof fetch;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : (input as Request).url;
    const rawHeaders: Record<string, string> = {};
    // A Request input carries its own headers; mirror what the real network sees.
    if (typeof Request !== 'undefined' && input instanceof Request) {
      input.headers.forEach((v, k) => {
        rawHeaders[k.toLowerCase()] = v;
      });
    }
    const source = init?.headers as Record<string, string> | undefined;
    if (source) for (const [k, v] of Object.entries(source)) rawHeaders[k.toLowerCase()] = String(v);
    const record: Recorded = {
      url,
      method: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(),
      headers: rawHeaders,
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    calls.push(record);
    const handler = routes[`${record.method} ${new URL(url, 'https://localhost').pathname}`];
    if (!handler) return new Response('{"success":false}', { status: 404 });
    return handler(record);
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CODE = 'A'.repeat(43);
const LIVE_TOKEN = jwt(Date.now() + 7 * DAY);
const BEARER: AccountBearer = {
  token: LIVE_TOKEN,
  userId: 'acct-1',
  email: 'a@example.com',
  name: 'A',
  picture: null,
  expiresAt: Date.now() + 7 * DAY,
};

// ---------------------------------------------------------------------------

describe('parseAuthCode', () => {
  it('reads auth_code (and the bare code alias) and rejects junk', () => {
    expect(parseAuthCode(`?${AUTH_CODE_PARAM}=${CODE}`)).toBe(CODE);
    expect(parseAuthCode(`${AUTH_CODE_PARAM}=${CODE}`)).toBe(CODE);
    expect(parseAuthCode(`?code=${CODE}`)).toBe(CODE);
    expect(parseAuthCode('?other=1')).toBeNull();
    expect(parseAuthCode(`?${AUTH_CODE_PARAM}=short`)).toBeNull();
    expect(parseAuthCode(`?${AUTH_CODE_PARAM}=${'z'.repeat(300)}`)).toBeNull();
    expect(parseAuthCode(null)).toBeNull();
    expect(parseAuthCode(undefined)).toBeNull();
  });

  it('trims and survives a code that needs URL decoding', () => {
    const padded = `${CODE}%3D%3D`;
    expect(parseAuthCode(`?${AUTH_CODE_PARAM}=${padded}`)).toBe(`${CODE}==`);
  });
});

describe('bearer expiry is read locally, never trusted for authority', () => {
  it('decodes exp into epoch ms and ignores unparseable tokens', () => {
    const exp = Date.now() + 1000;
    // The JWT `exp` claim has second resolution, so the local read can only be
    // accurate to within a second.
    expect(Math.abs(decodeTokenExpiryMs(jwt(exp)) - exp)).toBeLessThan(1000);
    expect(decodeTokenExpiryMs('not-a-jwt')).toBe(0);
    expect(decodeTokenExpiryMs('a.b')).toBe(0);
  });

  it('a token with no readable exp is never treated as expired', () => {
    expect(isBearerExpired({ ...BEARER, expiresAt: 0 }, Date.now())).toBe(false);
    expect(isBearerExpired({ ...BEARER, expiresAt: Date.now() - 1 })).toBe(true);
  });
});

describe('exchangeAuthCode (POST {code})', () => {
  it('posts the code in the body (never the URL) and shapes the bearer', async () => {
    const { fetch, calls } = fakeFetch({
      'POST /api/auth/token-login': () =>
        jsonResponse({ success: true, token: LIVE_TOKEN, user: { id: 'acct-1', email: 'a@example.com', name: 'A', picture: null } }),
    });
    const bearer = await exchangeAuthCode({ baseUrl: SERVER, code: CODE, fetchImpl: fetch });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${SERVER}/api/auth/token-login`);
    expect(calls[0].url).not.toContain(CODE);
    expect(JSON.parse(calls[0].body!)).toEqual({ code: CODE });
    expect(bearer.userId).toBe('acct-1');
    expect(bearer.token).toBe(LIVE_TOKEN);
    expect(bearer.expiresAt).toBeGreaterThan(Date.now());
  });

  it('surfaces the server reason on a 401 instead of inventing a success', async () => {
    const { fetch } = fakeFetch({
      'POST /api/auth/token-login': () => jsonResponse({ success: false, error: 'invalid_code' }, 401),
    });
    await expect(exchangeAuthCode({ baseUrl: SERVER, code: CODE, fetchImpl: fetch })).rejects.toThrow('invalid_code');
  });

  it('surfaces the 403 insecure_transport refusal (plaintext host)', async () => {
    const { fetch } = fakeFetch({
      'POST /api/auth/token-login': () => jsonResponse({ success: false, error: 'insecure_transport' }, 403),
    });
    await expect(exchangeAuthCode({ baseUrl: 'http://carbook.example.test', code: CODE, fetchImpl: fetch }))
      .rejects.toThrow('insecure_transport');
  });

  it('maps a network failure and a hung request to explicit reasons', async () => {
    const { fetch } = fakeFetch({});
    const dying: typeof fetch = (async () => {
      throw new Error('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(exchangeAuthCode({ baseUrl: SERVER, code: CODE, fetchImpl: dying })).rejects.toThrow('Failed to fetch');

    // A fetch that never settles must not hang the boot forever (rule 8).
    const hanging: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    await expect(exchangeAuthCode({ baseUrl: SERVER, code: CODE, fetchImpl: hanging, timeoutMs: 5 }))
      .rejects.toThrow('login_timeout');
    void fetch;
  });

  it('a 200 without a token is a failure, not an empty session', async () => {
    const { fetch } = fakeFetch({ 'POST /api/auth/token-login': () => jsonResponse({ success: true }) });
    await expect(exchangeAuthCode({ baseUrl: SERVER, code: CODE, fetchImpl: fetch })).rejects.toThrow('login_failed_200');
  });
});

describe('isServerApiUrl', () => {
  it('only matches the CarBook server origin (or same-origin relative /api)', () => {
    expect(isServerApiUrl(`${SERVER}/api/vehicles`, SERVER)).toBe(true);
    expect(isServerApiUrl(`${SERVER}/settings`, SERVER)).toBe(false);
    expect(isServerApiUrl('https://evil.example.test/api/vehicles', SERVER)).toBe(false);
    // Bundled shell: a relative /api/... is answered locally, so it is NOT the server.
    expect(isServerApiUrl('/api/vehicles', SERVER)).toBe(false);
    // Plain web build (no configured server) is same-origin.
    expect(isServerApiUrl('/api/vehicles', '')).toBe(true);
    expect(isServerApiUrl('garbage', SERVER)).toBe(false);
  });
});

describe('createBearerFetch attaches the account session', () => {
  it('adds Authorization to server API calls and leaves others alone', async () => {
    const store = memoryBearerStore(BEARER);
    const { fetch: base, calls } = fakeFetch({ 'GET /api/vehicles': () => jsonResponse({ success: true, data: [] }) });
    const wrapped = createBearerFetch(base, { store, serverBaseUrl: SERVER });

    await wrapped(`${SERVER}/api/vehicles`, {});
    await wrapped('https://other.example.test/api/vehicles', {});
    await wrapped('/api/vehicles', {});

    expect(calls[0].headers.authorization).toBe(`Bearer ${BEARER.token}`);
    expect(calls[1].headers.authorization).toBeUndefined();
    expect(calls[2].headers.authorization).toBeUndefined();
  });

  it('preserves existing headers and never overwrites a device Authorization', async () => {
    const store = memoryBearerStore(BEARER);
    const { fetch: base, calls } = fakeFetch({ 'POST /api/sync': () => jsonResponse({ success: true, data: {} }) });
    const wrapped = createBearerFetch(base, { store, serverBaseUrl: SERVER });

    await wrapped(`${SERVER}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer device-access-token' },
      body: '{}',
    });
    expect(calls[0].headers.authorization).toBe('Bearer device-access-token');
    expect(calls[0].headers['content-type']).toBe('application/json');

    // A Request object that already carries the header is respected too.
    const req = new Request(`${SERVER}/api/sync`, { method: 'POST', headers: { Authorization: 'Bearer device-2' } });
    await wrapped(req, {});
    expect(calls[1].headers.authorization).toBe('Bearer device-2');
  });

  it('drops a certainly-expired bearer locally without spending a round trip', async () => {
    const store = memoryBearerStore({ ...BEARER, token: jwt(Date.now() - 1000), expiresAt: Date.now() - 1000 });
    const { fetch: base, calls } = fakeFetch({ 'GET /api/vehicles': () => jsonResponse({ success: true, data: [] }) });
    const reasons: string[] = [];
    const wrapped = createBearerFetch(base, {
      store,
      serverBaseUrl: SERVER,
      onUnauthorized: (r) => reasons.push(r),
      now: () => Date.now(),
    });

    const res = await wrapped(`${SERVER}/api/vehicles`, {});
    expect(res.status).toBe(200);
    expect(store.value).toBeNull();
    expect(reasons).toEqual(['expired']);
    // Guest resume: the request still went out, just without a credential.
    expect(calls[0].headers.authorization).toBeUndefined();
  });

  it('a 401 burns the bearer once and reports it (guest resume, no silent half-login)', async () => {
    const store = memoryBearerStore(BEARER);
    const { fetch: base, calls } = fakeFetch({ 'POST /api/vehicles': () => jsonResponse({ success: false, error: 'Authentication required' }, 401) });
    const reasons: string[] = [];
    const wrapped = createBearerFetch(base, { store, serverBaseUrl: SERVER, onUnauthorized: (r) => reasons.push(r) });

    const res = await wrapped(`${SERVER}/api/vehicles`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(reasons).toEqual(['rejected']);
    expect(store.value).toBeNull();

    await wrapped(`${SERVER}/api/vehicles`, { method: 'POST', body: '{}' });
    // Guest resume: the call still goes out (local data is unaffected), it just
    // carries no credential any more.
    expect(calls).toHaveLength(2);
    expect(calls[1].headers.authorization).toBeUndefined();
  });

  it('with no bearer stored it is a transparent passthrough', async () => {
    const store = memoryBearerStore(null);
    const { fetch: base, calls } = fakeFetch({ 'GET /api/settings': () => jsonResponse({ success: true, data: {} }) });
    const wrapped = createBearerFetch(base, { store, serverBaseUrl: SERVER });
    await wrapped(`${SERVER}/api/settings`, {});
    expect(calls[0].headers.authorization).toBeUndefined();
  });
});

describe('runAccountHandoff (boot state machine)', () => {
  const issuedSession = (userId: string, guest: boolean): StoredSession => ({
    accessToken: 'device-access',
    refreshToken: 'device-refresh',
    userId,
    guest,
    expiresAt: Date.now() + 14 * 60 * 1000,
  });

  it('code -> exchange -> persist -> link once -> full re-pull hook', async () => {
    const bearerStore = memoryBearerStore(null);
    const sessionStore = memorySessionStore(issuedSession('guest:device-1', true));
    const deviceIdStore = memoryDeviceIdStore('device-1');
    const { fetch, calls } = fakeFetch({
      'POST /api/auth/token-login': () =>
        jsonResponse({ success: true, token: LIVE_TOKEN, user: { id: 'acct-1', email: 'a@example.com', name: 'A', picture: null } }),
      'PUT /api/auth/device': (req) => {
        expect(req.headers.authorization).toBe(`Bearer ${LIVE_TOKEN}`);
        expect(JSON.parse(req.body!)).toEqual({ deviceId: 'device-1' });
        return jsonResponse({
          success: true,
          data: { accessToken: 'device-access', refreshToken: 'device-refresh', sessionId: 's1', user: { id: 'acct-1', email: 'a@example.com', name: 'A', picture: null } },
        });
      },
    });
    const linked: string[] = [];

    const outcome = await runAccountHandoff({
      search: `?${AUTH_CODE_PARAM}=${CODE}`,
      baseUrl: SERVER,
      bearerStore,
      sessionStore,
      deviceIdStore,
      fetchImpl: fetch,
      onLinked: async (b) => {
        linked.push(b.userId);
      },
    });

    expect(outcome.kind).toBe('linked');
    expect((outcome as Extract<HandoffOutcome, { kind: 'linked' }>).linkedNow).toBe(true);
    expect((outcome as Extract<HandoffOutcome, { kind: 'linked' }>).bearer.userId).toBe('acct-1');
    expect((outcome as Extract<HandoffOutcome, { kind: 'linked' }>).session.guest).toBe(false);
    expect(linked).toEqual(['acct-1']);
    // Persisted for the restart, and the guest session store was replaced.
    expect(bearerStore.value?.token).toBe(LIVE_TOKEN);
    expect(sessionStore.value?.userId).toBe('acct-1');
    expect(calls.map((c) => c.url)).toEqual([
      `${SERVER}/api/auth/token-login`,
      `${SERVER}/api/auth/device`,
    ]);
  });

  it('a second boot with the same code does not re-redeem a spent code twice after linking', async () => {
    const bearerStore = memoryBearerStore(BEARER);
    const sessionStore = memorySessionStore(issuedSession('acct-1', false));
    const deviceIdStore = memoryDeviceIdStore('device-1');
    const { fetch, calls } = fakeFetch({
      'POST /api/auth/token-login': () => jsonResponse({ success: false, error: 'invalid_code' }, 401),
    });

    // The deep link fired again (e.g. a stale browser tab) but the device is
    // already bound: the exchange is attempted once, and the link step is a no-op.
    const outcome = await runAccountHandoff({
      search: `?${AUTH_CODE_PARAM}=${CODE}`,
      baseUrl: SERVER,
      bearerStore,
      sessionStore,
      deviceIdStore,
      fetchImpl: fetch,
    });
    expect(outcome.kind).toBe('failed');
    expect((outcome as Extract<HandoffOutcome, { kind: 'failed' }>).stage).toBe('exchange');
    expect(calls).toHaveLength(1);
  });

  it('restart with a stored bearer and no code: restored, zero network', async () => {
    const bearerStore = memoryBearerStore(BEARER);
    const sessionStore = memorySessionStore(issuedSession('acct-1', false));
    const { fetch, calls } = fakeFetch({});

    const outcome = await runAccountHandoff({
      search: '',
      baseUrl: SERVER,
      bearerStore,
      sessionStore,
      deviceIdStore: memoryDeviceIdStore(),
      fetchImpl: fetch,
    });
    expect(outcome.kind).toBe('restored');
    expect(calls).toHaveLength(0);
  });

  it('a stored bearer whose device session is still guest re-links on restart', async () => {
    const bearerStore = memoryBearerStore(BEARER);
    const sessionStore = memorySessionStore(issuedSession('guest:device-1', true));
    const { fetch, calls } = fakeFetch({
      'PUT /api/auth/device': () => jsonResponse({
        success: true,
        data: { accessToken: 'a', refreshToken: 'r', sessionId: 's', user: { id: 'acct-1', email: 'a@example.com', name: 'A', picture: null } },
      }),
    });
    const outcome = await runAccountHandoff({
      search: '',
      baseUrl: SERVER,
      bearerStore,
      sessionStore,
      deviceIdStore: memoryDeviceIdStore(),
      fetchImpl: fetch,
    });
    expect(outcome.kind).toBe('linked');
    expect((outcome as Extract<HandoffOutcome, { kind: 'linked' }>).linkedNow).toBe(true);
    expect(calls[0].method).toBe('PUT');
  });

  it('no code and no bearer stays an explicit guest (no network)', async () => {
    const { fetch, calls } = fakeFetch({});
    const outcome = await runAccountHandoff({
      search: '',
      baseUrl: SERVER,
      bearerStore: memoryBearerStore(null),
      sessionStore: memorySessionStore(null),
      deviceIdStore: memoryDeviceIdStore(),
      fetchImpl: fetch,
    });
    expect(outcome).toEqual({ kind: 'guest' });
    expect(calls).toHaveLength(0);
  });

  it('a failed exchange is explicit, drops the bearer and never half-links', async () => {
    const bearerStore = memoryBearerStore(BEARER);
    const sessionStore = memorySessionStore(issuedSession('guest:device-1', true));
    const { fetch, calls } = fakeFetch({
      'POST /api/auth/token-login': () => jsonResponse({ success: false, error: 'invalid_code' }, 401),
    });
    const outcome = await runAccountHandoff({
      search: `?${AUTH_CODE_PARAM}=${CODE}`,
      baseUrl: SERVER,
      bearerStore,
      sessionStore,
      deviceIdStore: memoryDeviceIdStore(),
      fetchImpl: fetch,
    });
    expect(outcome).toMatchObject({ kind: 'failed', stage: 'exchange', reason: 'invalid_code', bearerDropped: true });
    expect(bearerStore.value).toBeNull();
    expect(calls.some((c) => c.url.endsWith('/api/auth/device'))).toBe(false);
  });

  it('a 401 on the link step burns the credential (revoked jti) and resumes as guest', async () => {
    const bearerStore = memoryBearerStore(BEARER);
    const sessionStore = memorySessionStore(issuedSession('guest:device-1', true));
    const { fetch } = fakeFetch({
      'PUT /api/auth/device': () => {
        throw new SessionAuthError('A signed-in, non-guest account is required', 401);
      },
    });
    const outcome = await runAccountHandoff({
      search: '',
      baseUrl: SERVER,
      bearerStore,
      sessionStore,
      deviceIdStore: memoryDeviceIdStore(),
      fetchImpl: fetch,
    });
    expect(outcome).toMatchObject({ kind: 'failed', stage: 'link', bearerDropped: true });
    expect(bearerStore.value).toBeNull();
  });

  it('a 500 on the link step keeps the bearer so the next boot can retry', async () => {
    const bearerStore = memoryBearerStore(BEARER);
    const sessionStore = memorySessionStore(issuedSession('guest:device-1', true));
    const { fetch } = fakeFetch({
      'PUT /api/auth/device': () => {
        throw new SessionAuthError('boom', 500);
      },
    });
    const outcome = await runAccountHandoff({
      search: '',
      baseUrl: SERVER,
      bearerStore,
      sessionStore,
      deviceIdStore: memoryDeviceIdStore(),
      fetchImpl: fetch,
    });
    expect(outcome).toMatchObject({ kind: 'failed', stage: 'link', bearerDropped: false });
    expect(bearerStore.value?.token).toBe(LIVE_TOKEN);
  });

  it('an expired stored bearer is cleared instead of replayed', async () => {
    const expired = jwt(Date.now() - 1000);
    const bearerStore = memoryBearerStore({ ...BEARER, token: expired, expiresAt: Date.now() - 1000 });
    const { fetch, calls } = fakeFetch({});
    const outcome = await runAccountHandoff({
      search: '',
      baseUrl: SERVER,
      bearerStore,
      sessionStore: memorySessionStore(issuedSession('acct-1', false)),
      deviceIdStore: memoryDeviceIdStore(),
      fetchImpl: fetch,
    });
    expect(outcome).toMatchObject({ kind: 'failed', stage: 'exchange', reason: 'session_expired', bearerDropped: true });
    expect(bearerStore.value).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('with no server configured it fails loudly rather than pretending to link', async () => {
    const bearerStore = memoryBearerStore(BEARER);
    const outcome = await runAccountHandoff({
      search: '',
      baseUrl: '',
      bearerStore,
      sessionStore: memorySessionStore(issuedSession('guest:device-1', true)),
      deviceIdStore: memoryDeviceIdStore(),
      fetchImpl: fakeFetch({}).fetch,
    });
    expect(outcome).toMatchObject({ kind: 'failed', stage: 'link', reason: 'no_server_configured', bearerDropped: false });
  });

  it('mints a device id on first ever link (no stored id)', async () => {
    const deviceIdStore = memoryDeviceIdStore(null);
    const { fetch } = fakeFetch({
      'PUT /api/auth/device': (req) => {
        expect(req.url).toContain(SERVER);
        expect(JSON.parse(req.body!)).toEqual({ deviceId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
        return jsonResponse({
          success: true,
          data: { accessToken: 'a', refreshToken: 'r', sessionId: 's', user: { id: 'acct-1', email: 'a@example.com', name: 'A', picture: null } },
        });
      },
    });
    const outcome = await runAccountHandoff({
      search: '',
      baseUrl: SERVER,
      bearerStore: memoryBearerStore(BEARER),
      sessionStore: memorySessionStore(null),
      deviceIdStore,
      fetchImpl: fetch,
    });
    expect(outcome.kind).toBe('linked');
    expect(deviceIdStore.value).toMatch(/^[0-9a-f-]{36}$/);
  });
});
