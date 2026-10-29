// Device session lifecycle for the bundled app.
//
// The refresh token is the device's long-lived credential and lives in the
// platform keystore (injected as `SessionStore`); the access token is short
// lived and re-minted whenever it is close to expiring. Nothing here imports
// Capacitor, so the whole flow runs under plain vitest.

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  guest: boolean;
  /** Epoch ms after which the access token must be refreshed. */
  expiresAt: number;
}

export interface SessionStore {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export interface SessionTransport {
  fetchImpl?: typeof fetch;
  baseUrl: string;
}

/** Refresh this long before the token actually dies, so a sync never races it. */
const RENEW_SKEW_MS = 60 * 1000;

interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: { id: string; email: string; name: string; picture: string | null; guest?: boolean };
}

function toStored(issued: IssuedSession): StoredSession {
  return {
    accessToken: issued.accessToken,
    refreshToken: issued.refreshToken,
    userId: issued.user.id,
    guest: issued.user.guest === true,
    expiresAt: Date.now() + 14 * 60 * 1000,
  };
}

async function call<T>(transport: SessionTransport, init: RequestInit): Promise<T> {
  const doFetch = transport.fetchImpl ?? fetch;
  const res = await doFetch(`${transport.baseUrl.replace(/\/$/, '')}/api/auth/device`, init);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error || `auth failed: ${res.status}`);
  return json.data as T;
}

/** Return a usable session, registering the device or refreshing its token as needed. */
export async function ensureSession(
  store: SessionStore,
  deviceId: string,
  transport: SessionTransport,
): Promise<StoredSession> {
  const existing = await store.load();
  if (existing && existing.expiresAt - RENEW_SKEW_MS > Date.now()) return existing;

  const json = { 'Content-Type': 'application/json' };
  let issued: IssuedSession;
  try {
    if (!existing) {
      issued = await call<IssuedSession>(transport, { method: 'POST', headers: json, body: JSON.stringify({ deviceId }) });
    } else {
      issued = await call<IssuedSession>(transport, {
        method: 'POST', headers: json, body: JSON.stringify({ deviceId, refreshToken: existing.refreshToken }),
      });
    }
  } catch (err) {
    // A refresh that the server rejects means this token is no longer valid at all
    // (reuse detection, or the account was removed). Re-registering is the only way back.
    if (!existing) throw err;
    await store.clear();
    issued = await call<IssuedSession>(transport, { method: 'POST', headers: json, body: JSON.stringify({ deviceId }) });
  }

  const session = toStored(issued);
  await store.save(session);
  return session;
}

/**
 * Hand the device's guest data to the signed-in account.
 *
 * `accountToken` must belong to the real user, not to this device's guest
 * identity — the server refuses a guest bearer precisely so a guest cannot
 * merge itself into an account it does not own. The caller obtains it from the
 * OAuth handoff once the user has signed in.
 */
export async function linkDeviceToAccount(
  store: SessionStore,
  deviceId: string,
  accountToken: string,
  transport: SessionTransport,
): Promise<StoredSession> {
  const issued = await call<IssuedSession>(transport, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountToken}` },
    body: JSON.stringify({ deviceId }),
  });

  const session = toStored(issued);
  await store.save(session);
  return session;
}
