import { NextRequest, NextResponse } from 'next/server';
import type { OwnedTable, StorageRepository } from '@/persistence/repository';
import { getAuthenticatedUser, verifySessionToken, type AuthSessionUser } from '@/services/auth';

/** An authorization failure the routes map straight to an HTTP status. */
export class AuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * The bearer half of the offline→account bridge (task #17).
 *
 * A bundled Capacitor app runs on the local `https://localhost` origin, so its
 * cross-origin fetches can never carry the SameSite=lax `carbook_session`
 * cookie. It authenticates with `Authorization: Bearer <session JWT>` instead —
 * the same token type the cookie holds, checked by the same
 * `verifySessionToken`, so a revoked `jti` (logout) is rejected over bearer
 * exactly as over cookie. Nothing about cookie behaviour changes.
 *
 * Returns null for a non-bearer header so callers fall through to the cookie.
 */
export function bearerUser(req: NextRequest): AuthSessionUser | null {
  const raw = req.headers.get('authorization');
  if (!raw) return null;
  const match = /^Bearer\s+(\S.+)$/i.exec(raw.trim());
  if (!match) return null;
  return verifySessionToken(match[1]);
}

/**
 * Bearer first, then the session cookie.
 *
 * The same precedence `getAuthenticatedUser` already applies; it is spelled out
 * here so every route going through `requireUser` — /api/vehicles, /api/fuel,
 * /api/maintenance, /api/schedules, /api/reports, /api/settings, /api/ai/* —
 * inherits the bearer bridge by construction instead of by coincidence.
 */
export function resolveUser(req: NextRequest): AuthSessionUser | null {
  return bearerUser(req) ?? getAuthenticatedUser(req);
}

export function requireUser(req: NextRequest): AuthSessionUser {
  const user = resolveUser(req);
  if (!user) throw new AuthError(401, 'Authentication required');
  return user;
}

/**
 * The caller must own the record addressed by `recordId`. A miss is reported as
 * 404, not 403, so probing ids cannot distinguish "someone else's" from "absent".
 */
export async function requireOwnership(
  repo: StorageRepository,
  table: OwnedTable,
  recordId: string | null | undefined,
  userId: string,
): Promise<void> {
  if (!recordId) throw new AuthError(400, `${table} id is required`);
  const owner = await repo.ownerOf(table, recordId);
  if (owner !== userId) throw new AuthError(404, 'Not found');
}

/** Returns the response for an AuthError, or null so the caller falls through to its own handling. */
export function authErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof AuthError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }
  return null;
}
