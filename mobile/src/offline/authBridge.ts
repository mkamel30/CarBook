// The offline -> account auth bridge (task #17).
//
// WHY THIS EXISTS
// The shipped APK is a BUNDLED local app: Capacitor serves the UI from its own
// `https://localhost` origin and every call to the backend is cross-origin. A
// cross-origin fetch cannot carry the `carbook_session` cookie (SameSite=lax,
// and the WebView jar belongs to the server origin anyway), so before this
// bridge the app could not log in or push its guest data to an account at all.
//
// THE BRIDGE
//   1. Android's deep link rewrites `carbook://login?code=X` into a load of
//      `<app origin>/index.html?auth_code=X` — the LOCAL app, not the server.
//   2. On boot we read `auth_code`, POST it to `/api/auth/token-login`, and get
//      the durable session JWT back in a JSON body instead of a cookie.
//   3. That JWT is persisted in the bearer store and attached as
//      `Authorization: Bearer …` to every passthrough call to the server, and
//      handed to `linkDeviceToAccount` so the device's guest rows move onto the
//      account. Then a full re-pull merges the claimed rows down again.
//   4. Any 401 against the attached bearer means the server no longer accepts
//      this credential (revoked jti / logged out / expired). We drop the bearer
//      and say so through the status chip — never a silent half-login.
//
// SECRET HYGIENE (AGENTS rule 5): the token is only ever held in the bearer
// store and the Authorization header. It is never put in a URL, never logged,
// and never written to the sync cursor.
// TODO(#17 follow-up): the bearer lives in localStorage because that is what
// the shell has today. It must move to the platform keystore/EncryptedSharedPreferences
// (Capacitor Preferences with secure storage, or a small native plugin) so a
// rooted/backup-extracted webview directory cannot replay a 7-day session.

import { ensureDeviceId, type DeviceIdStore } from '@device/runtime';
import { linkDeviceToAccount, SessionAuthError, type SessionStore, type StoredSession } from '@device/session';

/** Query parameter the native deep link hands the bundled app. */
export const AUTH_CODE_PARAM = 'auth_code';

/** The account session, as the app stores it. */
export interface AccountBearer {
  /** Durable session JWT — sent as `Authorization: Bearer <token>`. */
  token: string;
  userId: string;
  email: string;
  name: string;
  picture: string | null;
  /** Epoch ms from the JWT's own `exp`; 0 when the token carried no readable exp. */
  expiresAt: number;
}

export interface BearerStore {
  load(): Promise<AccountBearer | null>;
  save(bearer: AccountBearer): Promise<void>;
  clear(): Promise<void>;
}

export type HandoffFailureStage = 'exchange' | 'link';

export type HandoffOutcome =
  /** Nothing to do: no code in the URL and no stored bearer — still a guest. */
  | { kind: 'guest' }
  /** A stored bearer is still valid; no link needed (restart, already linked). */
  | { kind: 'restored'; bearer: AccountBearer }
  /**
   * The bearer is live and the device session is bound to that account.
   * `linkedNow` is true only when THIS run performed the hand-off, which is also
   * the only moment a full re-pull is required.
   */
  | { kind: 'linked'; bearer: AccountBearer; session: StoredSession; linkedNow: boolean }
  /** Explicit failure with the stage that produced it — the UI must surface this. */
  | { kind: 'failed'; stage: HandoffFailureStage; reason: string; bearerDropped: boolean };

// ---------------------------------------------------------------------------
// URL / JWT parsing — pure, so the native contract is testable without a WebView
// ---------------------------------------------------------------------------

/**
 * Read the handoff code out of a `location.search` string.
 *
 * `auth_code` is what MainActivity writes for the bundled app. `code` is
 * accepted as an alias for one release: if a native build still emits the bare
 * deep-link parameter, the app must not quietly do nothing with it (rule 8 —
 * an unused code would look like a successful login and never happen again,
 * because codes are single-use).
 */
export function parseAuthCode(search: string | null | undefined): string | null {
  if (!search) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    return null;
  }
  const raw = params.get(AUTH_CODE_PARAM) ?? params.get('code');
  if (raw === null) return null;
  const code = raw.trim();
  // A redeemable code is a 43-char base64url string; reject nonsense early.
  return code.length >= 32 && code.length <= 200 ? code : null;
}

function b64urlJson(part: string): any | null {
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const decoded = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Expiry of a session JWT in epoch ms, or 0 when it cannot be read.
 *
 * Parsed locally and only used to decide "this bearer is certainly dead, do not
 * even send it". The server re-checks `exp` and the revocation list on every
 * request, so a wrong local read can never widen access.
 */
export function decodeTokenExpiryMs(token: string): number {
  const parts = String(token).split('.');
  if (parts.length !== 3) return 0;
  const payload = b64urlJson(parts[1]);
  const exp = typeof payload?.exp === 'number' ? payload.exp : 0;
  return exp > 0 ? exp * 1000 : 0;
}

export function isBearerExpired(bearer: AccountBearer, now = Date.now()): boolean {
  return bearer.expiresAt !== 0 && bearer.expiresAt <= now;
}

// ---------------------------------------------------------------------------
// Code -> bearer exchange
// ---------------------------------------------------------------------------

export interface ExchangeOptions {
  baseUrl: string;
  code: string;
  fetchImpl?: typeof fetch;
  /** Bounded wait (rule 8): a stuck TLS handshake must not hang the boot forever. */
  timeoutMs?: number;
}

export const DEFAULT_HANDOFF_TIMEOUT_MS = 15_000;

/** POST {code} to the token-login endpoint and shape the account bearer. */
export async function exchangeAuthCode(opts: ExchangeOptions): Promise<AccountBearer> {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, '');
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HANDOFF_TIMEOUT_MS;
  const timer = controller
    ? setTimeout(() => controller.abort(), Math.max(1, timeoutMs))
    : undefined;

  let res: Response;
  try {
    res = await doFetch(`${base}/api/auth/token-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The code is single-use and short-lived; it goes in a body, never a URL,
      // so it stays out of the intent log, history and any proxy access log.
      body: JSON.stringify({ code: opts.code }),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (err) {
    if (controller?.signal.aborted) throw new Error('login_timeout');
    throw new Error(err instanceof Error ? err.message : 'login_network_error');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.token || !json?.user?.id) {
    throw new Error(String(json?.error || `login_failed_${res.status}`));
  }

  return {
    token: String(json.token),
    userId: String(json.user.id),
    email: String(json.user.email ?? ''),
    name: String(json.user.name ?? ''),
    picture: json.user.picture ?? null,
    expiresAt: decodeTokenExpiryMs(String(json.token)),
  };
}

// ---------------------------------------------------------------------------
// Attaching the bearer to server traffic
// ---------------------------------------------------------------------------

export interface BearerFetchOptions {
  store: BearerStore;
  /** Server origin the bundled app talks to; '' means same-origin. */
  serverBaseUrl: string;
  /** Called after a 401 burned the bearer, so the host can show a real state. */
  onUnauthorized?: (reason: 'rejected' | 'expired') => void;
  now?: () => number;
}

function headerNames(source: HeadersInit | undefined): string[] {
  if (!source) return [];
  if (source instanceof Headers) {
    const names: string[] = [];
    source.forEach((_v, k) => names.push(k.toLowerCase()));
    return names;
  }
  if (Array.isArray(source)) return source.map(([k]) => String(k).toLowerCase());
  return Object.keys(source).map((k) => k.toLowerCase());
}

function withBearer(init: RequestInit | undefined, token: string, input: RequestInfo | URL): RequestInit {
  const base: Record<string, string> = {};
  const source = init?.headers;
  if (source instanceof Headers) source.forEach((v, k) => { base[k] = v; });
  else if (Array.isArray(source)) for (const [k, v] of source) base[String(k)] = String(v);
  else if (source) for (const [k, v] of Object.entries(source as Record<string, any>)) base[k] = String(v);
  else if (typeof Request !== 'undefined' && input instanceof Request) {
    input.headers.forEach((v, k) => { base[k] = v; });
  }
  base.Authorization = `Bearer ${token}`;
  return { ...(init || {}), headers: base };
}

/** True when `url` is a call to the CarBook server's API surface. */
export function isServerApiUrl(url: string, serverBaseUrl: string): boolean {
  const absolute = /^https?:\/\//i.test(url);
  if (!absolute) {
    // Relative /api/... only reaches the network when the app IS the server
    // origin (plain web build); in the bundled shell it is answered locally.
    return !serverBaseUrl && url.startsWith('/api/');
  }
  if (!serverBaseUrl) return false;
  try {
    const here = new URL(url);
    const server = new URL(serverBaseUrl);
    return here.origin === server.origin && here.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

/**
 * Wrap the real network fetch so server API calls carry the account bearer.
 *
 * Two deliberate non-negotiables:
 *  * An existing `Authorization` header is never overwritten. The sync runtime
 *    authenticates /api/sync with its own short-lived device access token, and
 *    silently replacing it would desync the wrong identity.
 *  * A 401 on a request WE authorised burns the bearer and reports it. One
 *    rejected call is enough: the credential is dead, so retrying with it just
 *    hides the real problem (sign in again) behind a spinner.
 */
export function createBearerFetch(baseFetch: typeof fetch, opts: BearerFetchOptions): typeof fetch {
  const now = opts.now ?? (() => Date.now());

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' || input instanceof URL
      ? String(input)
      : (input as Request).url;

    if (!isServerApiUrl(url, opts.serverBaseUrl)) return baseFetch(input as RequestInfo, init);

    const alreadySet =
      headerNames(init?.headers).includes('authorization')
      || (typeof Request !== 'undefined' && input instanceof Request && input.headers.has('authorization'));
    if (alreadySet) return baseFetch(input as RequestInfo, init);

    const bearer = await opts.store.load();
    if (!bearer) return baseFetch(input as RequestInfo, init);

    if (isBearerExpired(bearer, now())) {
      // Certainly dead: drop it locally and go on as a guest instead of
      // spending a round trip on a token the server has already rejected.
      await opts.store.clear();
      opts.onUnauthorized?.('expired');
      return baseFetch(input as RequestInfo, init);
    }

    const res = await baseFetch(input as RequestInfo, withBearer(init, bearer.token, input));
    if (res.status === 401) {
      await opts.store.clear();
      opts.onUnauthorized?.('rejected');
    }
    return res;
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// The boot-time handoff state machine
// ---------------------------------------------------------------------------

export interface HandoffDeps {
  /** `location.search` of the bundled app after the deep-link load. */
  search: string | null | undefined;
  baseUrl: string;
  bearerStore: BearerStore;
  sessionStore: SessionStore;
  deviceIdStore: DeviceIdStore;
  /** RAW fetch (not the bearer-wrapped one): the handoff authenticates itself. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /**
   * Invoked once, immediately after a successful link, before the outcome is
   * returned. The host uses it to rewind the sync cursor and re-pull, so the
   * rows the server just re-owned come back down onto the device.
   */
  onLinked?: (bearer: AccountBearer) => void | Promise<void>;
}

/**
 * Resolve the account session and bind this device to it.
 *
 * Safe to call on every boot, including restarts where nothing happened (no
 * code, valid stored bearer) and restarts after a link that failed halfway —
 * the stored bearer makes the link retryable, because the code itself cannot be
 * redeemed twice.
 */
export async function runAccountHandoff(deps: HandoffDeps): Promise<HandoffOutcome> {
  const code = parseAuthCode(deps.search);

  if (code) {
    try {
      const bearer = await exchangeAuthCode({
        baseUrl: deps.baseUrl,
        code,
        fetchImpl: deps.fetchImpl,
        timeoutMs: deps.timeoutMs,
      });
      await deps.bearerStore.save(bearer);
    } catch (err) {
      // The code is spent or the network failed — either way this device stays
      // a guest until the user signs in again. Say so; do not swallow it.
      await deps.bearerStore.clear();
      return {
        kind: 'failed',
        stage: 'exchange',
        reason: err instanceof Error ? err.message : String(err),
        bearerDropped: true,
      };
    }
  }

  const bearer = await deps.bearerStore.load();
  if (!bearer) return { kind: 'guest' };

  if (isBearerExpired(bearer)) {
    await deps.bearerStore.clear();
    return { kind: 'failed', stage: 'exchange', reason: 'session_expired', bearerDropped: true };
  }

  // Is the device already bound to THIS account? The linked session is non-guest
  // and carries the same user id as the bearer; anything else needs the hand-off.
  const session = await deps.sessionStore.load();
  const alreadyLinked = !!session && !session.guest && session.userId === bearer.userId;
  if (alreadyLinked && session) {
    return code ? { kind: 'linked', bearer, session, linkedNow: false } : { kind: 'restored', bearer };
  }

  if (!deps.baseUrl) {
    return { kind: 'failed', stage: 'link', reason: 'no_server_configured', bearerDropped: false };
  }

  try {
    const deviceId = await ensureDeviceId(deps.deviceIdStore);
    const issued = await linkDeviceToAccount(
      deps.sessionStore,
      deviceId,
      bearer.token,
      { baseUrl: deps.baseUrl, fetchImpl: deps.fetchImpl },
    );
    if (deps.onLinked) await deps.onLinked(bearer);
    return { kind: 'linked', bearer, session: issued, linkedNow: true };
  } catch (err) {
    const rejected = err instanceof SessionAuthError && err.status === 401;
    if (rejected) {
      // The server refused our account credential (revoked jti / logged out
      // elsewhere). Keeping it would leave the app showing "signed in" while
      // every call fails, so drop it and fall back to local guest mode.
      await deps.bearerStore.clear();
    }
    return {
      kind: 'failed',
      stage: 'link',
      reason: err instanceof Error ? err.message : String(err),
      bearerDropped: rejected,
    };
  }
}
