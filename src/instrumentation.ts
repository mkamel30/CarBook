/**
 * Next.js server bootstrap hook (T6).
 *
 * verifySessionToken checks revocations synchronously from an in-process
 * cache; the durable copy lives in the `revocations` table. On every Node
 * server start we hydrate the cache from the table so a restart cannot
 * silently un-revoke logged-out sessions. Failure is logged, not fatal: with
 * an empty cache the worst case is a revoked cookie surviving until its exp —
 * no weaker than the pre-T6 behaviour where revocation did not exist.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { loadRevocations } = await import('./services/auth');
    await loadRevocations();
  } catch (err) {
    console.error('CarBook: revocation hydration failed at startup:', err);
  }
}
