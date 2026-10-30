import { NextRequest, NextResponse } from 'next/server';
import type { OwnedTable, StorageRepository } from '@/persistence/repository';
import { getAuthenticatedUser, type AuthSessionUser } from '@/services/auth';

/** An authorization failure the routes map straight to an HTTP status. */
export class AuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function requireUser(req: NextRequest): AuthSessionUser {
  const user = getAuthenticatedUser(req);
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
