import crypto from 'crypto';
import { getDatabase } from '../persistence/db';
import { signAccessToken, type AuthSessionUser } from './auth';

/**
 * Device identity and the guest -> account hand-off.
 *
 * A device registers once and gets a refresh token it keeps in the platform
 * keystore. That token is stored only as a SHA-256 hash, so a database dump
 * cannot be replayed against the API. Each (user, device) pair has its own row,
 * which is what lets a phone and a desktop stay signed in at the same time.
 *
 * Before sign-in the device owns a guest user row rather than writing
 * `user_id IS NULL` orphans. Guest data is therefore already scoped, readable
 * and syncable with no special cases, and linking is a single reassignment.
 */

const DEVICE_ID = /^[A-Za-z0-9._:-]{8,64}$/;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: AuthSessionUser;
}

function assertDeviceId(deviceId: string): string {
  if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId)) {
    throw new Error('deviceId must be 8-64 chars of letters, digits, dot, colon, dash or underscore');
  }
  return deviceId;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function guestUserId(deviceId: string): string {
  return `guest:${deviceId}`;
}

async function loadUser(client: any, userId: string): Promise<AuthSessionUser | null> {
  const res = await client.execute({
    sql: 'SELECT id, email, name, picture, is_guest FROM users WHERE id = ?',
    args: [userId],
  });
  const row = res.rows[0] as any;
  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    picture: row.picture ?? null,
    ...(Number(row.is_guest) === 1 ? { guest: true } : {}),
  };
}

/**
 * Creates the session row and returns a fresh token pair. Any previous row for
 * the same device is revoked first, so a stolen or stale token stops working
 * the moment the device re-registers.
 */
async function issue(
  client: any,
  user: AuthSessionUser,
  deviceId: string,
): Promise<IssuedSession> {
  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();
  const refreshToken = newToken();

  await client.batch([
    {
      sql: 'UPDATE device_sessions SET revoked_at = ? WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL',
      args: [now, user.id, deviceId],
    },
    {
      sql: `INSERT INTO device_sessions (id, user_id, device_id, refresh_hash, created_at, last_used_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      args: [sessionId, user.id, deviceId, hashToken(refreshToken), now, now],
    },
  ], 'write');

  return {
    accessToken: signAccessToken(user),
    refreshToken,
    sessionId,
    user,
  };
}

/** First contact from a device: create or re-use its guest identity. */
export async function registerDevice(
  deviceIdInput: string,
  opts?: { dbPath?: string },
): Promise<IssuedSession> {
  const deviceId = assertDeviceId(deviceIdInput);
  const { client } = await getDatabase(opts?.dbPath);
  const now = new Date().toISOString();
  const id = guestUserId(deviceId);

  await client.execute({
    sql: `INSERT INTO users (id, email, name, picture, created_at, last_login_at, is_guest)
          VALUES (?, ?, ?, NULL, ?, ?, 1)
          ON CONFLICT(id) DO UPDATE SET last_login_at = excluded.last_login_at`,
    args: [id, `${deviceId}@device.invalid`, 'Guest device', now, now],
  });

  const user = await loadUser(client, id);
  if (!user) throw new Error('Failed to create guest identity');
  return issue(client, user, deviceId);
}

/**
 * Exchange a refresh token for a new token pair. The presented token is
 * consumed either way: reuse of an already-rotated token means the token was
 * copied, so every session for that device is revoked instead of reissued.
 */
export async function refreshDeviceSession(
  deviceIdInput: string,
  refreshToken: string,
  opts?: { dbPath?: string },
): Promise<IssuedSession> {
  const deviceId = assertDeviceId(deviceIdInput);
  if (typeof refreshToken !== 'string' || refreshToken.length < 32) {
    throw new Error('Invalid refresh token');
  }
  const { client } = await getDatabase(opts?.dbPath);

  const res = await client.execute({
    sql: 'SELECT user_id, device_id, revoked_at FROM device_sessions WHERE refresh_hash = ?',
    args: [hashToken(refreshToken)],
  });
  const row = res.rows[0] as any;
  if (!row) throw new Error('Unknown refresh token');
  // The token carries its device, so a caller cannot redeem someone else's token
  // under a chosen device id and have the revocation land on the wrong device.
  if (String(row.device_id) !== deviceId) throw new Error('Refresh token does not belong to this device');

  const now = new Date().toISOString();
  if (row.revoked_at) {
    await client.execute({
      sql: 'UPDATE device_sessions SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL',
      args: [now, deviceId],
    });
    throw new Error('Refresh token reuse detected; device sessions revoked');
  }

  const user = await loadUser(client, String(row.user_id));
  if (!user) throw new Error('Session owner no longer exists');

  await client.execute({ sql: 'UPDATE device_sessions SET last_used_at = ? WHERE refresh_hash = ?', args: [now, hashToken(refreshToken)] });
  return issue(client, user, deviceId);
}

export async function revokeDeviceSession(
  userId: string,
  sessionId: string,
  opts?: { dbPath?: string },
): Promise<void> {
  const { client } = await getDatabase(opts?.dbPath);
  await client.execute({
    sql: 'UPDATE device_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
    args: [new Date().toISOString(), sessionId, userId],
  });
}

export interface LinkResult extends IssuedSession {
  movedVehicles: number;
}

/**
 * One-time hand-off of a device's guest data to a real account.
 *
 * The guest row is removed afterwards so an account can never accumulate a
 * second hidden owner; anything that somehow stayed behind would otherwise be
 * unreachable. The device keeps its identity and simply gets a session bound
 * to the real user.
 */
export async function linkGuestToUser(
  guestDeviceIdInput: string,
  realUserId: string,
  opts?: { dbPath?: string },
): Promise<LinkResult> {
  const guestDeviceId = assertDeviceId(guestDeviceIdInput);
  const { client } = await getDatabase(opts?.dbPath);

  const real = await loadUser(client, realUserId);
  if (!real) throw new Error('Target account does not exist');
  if (real.guest) throw new Error('Cannot link a guest account into another guest account');

  const guestId = guestUserId(guestDeviceId);
  const guest = await loadUser(client, guestId);
  if (!guest) {
    const session = await issue(client, real, guestDeviceId);
    return { ...session, movedVehicles: 0 };
  }
  if (guestId === realUserId) throw new Error('Guest and target accounts are the same');

  const moved = await client.execute({ sql: 'SELECT id FROM vehicles WHERE user_id = ?', args: [guestId] });
  const vehicleIds = moved.rows.map((r: any) => String(r.id));
  const placeholders = vehicleIds.map(() => '?').join(', ');

  const childTables = ['maintenance_schedules', 'maintenance_logs', 'fuel_logs'];
  let pending = vehicleIds.length;
  const childCounts: Record<string, number> = {};
  for (const t of childTables) {
    if (!vehicleIds.length) { childCounts[t] = 0; continue; }
    const c = await client.execute({
      sql: `SELECT COUNT(*) AS n FROM ${t} WHERE vehicle_id IN (${placeholders})`,
      args: vehicleIds,
    });
    childCounts[t] = Number((c.rows[0] as any).n);
    pending += childCounts[t];
  }

  const now = new Date().toISOString();
  const stmts: Array<{ sql: string; args: any[] }> = [];

  if (vehicleIds.length) {
    // Re-publish the moved rows under a fresh seq so the account's other devices
    // pull them; without this the phone merges data the desktop never sees.
    stmts.push({ sql: 'UPDATE sync_counter SET value = value + ? WHERE id = 1;', args: [pending] });
    const nextSeq = '(SELECT value FROM sync_counter WHERE id = 1)';
    stmts.push({
      sql: `UPDATE vehicles SET user_id = ?, rev = rev + 1, seq = ${nextSeq}, sync_ts = ? WHERE id IN (${placeholders})`,
      args: [realUserId, now, ...vehicleIds],
    });
    for (const t of childTables) {
      if (!childCounts[t]) continue;
      stmts.push({
        sql: `UPDATE ${t} SET rev = rev + 1, seq = ${nextSeq}, sync_ts = ? WHERE vehicle_id IN (${placeholders})`,
        args: [now, ...vehicleIds],
      });
    }
  }

  stmts.push(
    { sql: 'UPDATE device_sessions SET user_id = ?, revoked_at = ? WHERE user_id = ?', args: [realUserId, now, guestId] },
    { sql: 'DELETE FROM users WHERE id = ?', args: [guestId] },
  );

  await client.batch(stmts, 'write');

  const session = await issue(client, real, guestDeviceId);
  return { ...session, movedVehicles: vehicleIds.length };
}

/**
 * One-time OAuth handoff codes for the mobile deep link.
 *
 * The old flow put a 30-day session JWT straight into `carbook://login?token=…`,
 * which leaks into the OS intent log, browser history and any WebView chrome —
 * a durable credential in a URL. Instead the callback mints a random 256-bit
 * code, stores only SHA-256(code) -> userId in `auth_codes`, and hands the raw
 * code to the app once. Redemption is atomic (the UPDATE is guarded on
 * `used = 0` and its change count is checked), short-lived, and useless without
 * the row, so a captured URL dies after a single use or on expiry.
 */

export const AUTH_CODE_TTL_SECONDS = 10 * 60;

/** Mint a single-use code for `userId` and return the raw code (never persisted). */
export async function issueOneTimeCode(
  userId: string,
  opts?: { dbPath?: string },
): Promise<string> {
  const code = newToken();
  const { client } = await getDatabase(opts?.dbPath);
  const exp = Math.floor(Date.now() / 1000) + AUTH_CODE_TTL_SECONDS;
  await client.execute({
    sql: 'INSERT INTO auth_codes (id, user_id, exp, used) VALUES (?, ?, ?, 0)',
    args: [hashToken(code), userId, exp],
  });
  return code;
}

/**
 * Redeem a handoff code, returning its owner's user id, or null when the code
 * is unknown, already spent, or past its expiry.
 */
export async function redeemOneTimeCode(
  code: string,
  opts?: { dbPath?: string },
): Promise<string | null> {
  if (typeof code !== 'string' || code.length < 32) return null;
  const { client } = await getDatabase(opts?.dbPath);
  const id = hashToken(code);
  const now = Math.floor(Date.now() / 1000);

  const res = await client.execute({
    sql: 'SELECT user_id, exp, used FROM auth_codes WHERE id = ?',
    args: [id],
  });
  const row = res.rows[0] as any;
  if (!row) return null;
  if (Number(row.used) !== 0) return null;
  if (Number(row.exp) < now) return null;

  // Atomic claim: exactly one concurrent caller can flip used 0 -> 1.
  const upd = await client.execute({
    sql: 'UPDATE auth_codes SET used = 1 WHERE id = ? AND used = 0',
    args: [id],
  });
  if (Number(upd.rowsAffected) !== 1) return null;

  return String(row.user_id);
}

