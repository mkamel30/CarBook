/**
 * Keyed request cache with in-flight dedupe (A5).
 *
 * Two independent mechanisms, because they answer two different problems:
 *
 * 1. DEDUPE (time-unbounded, request-lifetime): concurrent reads of the same key
 *    share one promise. A vehicle save refreshes the details list twice in a row
 *    (the explicit refresh + the `selectedVehicle` effect that the refreshed list
 *    triggers), so the second read joins the first instead of issuing a second
 *    round trip whose answer would be discarded anyway.
 *
 * 2. FRESHNESS (time-bounded, `ttlMs`): a completed read may ANSWER a later read
 *    from its snapshot while it is younger than the TTL. A snapshot is only ever
 *    served when the caller did not pass `force`, and every successful write in
 *    the page invalidates its key, so a user-visible mutation is never hidden by
 *    the cache — the refetch after a write always goes to the network.
 *
 * `ttlMs = 0` therefore means "dedupe only, never serve from cache", which is the
 * rule for endpoints whose freshness is a product requirement (the vehicle list,
 * settings).
 *
 * The clock and the fetcher are injected so this module is unit-testable without
 * React or a network.
 */

export interface CacheEntry<T> {
  value: T;
  /** Millisecond timestamp taken from the injected clock when stored. */
  storedAt: number;
}

export type LoadDecision = 'network' | 'join' | 'cache';

export interface RequestCache<T> {
  /** Fresh snapshot for `key`, or `undefined` when absent/expired. */
  peek(key: string): T | undefined;
  /** Age of the stored snapshot in ms; `Infinity` when there is none. */
  ageOf(key: string): number;
  isFresh(key: string): boolean;
  hasInflight(key: string): boolean;
  /** Number of stored snapshots (test/diagnostic surface). */
  size(): number;
  remember(key: string, value: T): void;
  invalidate(key: string): void;
  clear(): void;
  /**
   * Read `key`. `force` skips both the snapshot and the dedupe join: it always
   * starts a new request and overwrites the snapshot when it lands. Used by every
   * post-write refresh, because an in-flight request started BEFORE the write
   * landed may answer with pre-write rows.
   */
  load(key: string, fetcher: () => Promise<T>, force?: boolean): Promise<T>;
}

/**
 * Pure decision rule — the whole caching policy in one place so it can be tested
 * directly instead of being inferred from the wrapper.
 */
export function planLoad(input: {
  force: boolean;
  hasInflight: boolean;
  hasSnapshot: boolean;
  ageMs: number;
  ttlMs: number;
}): LoadDecision {
  if (input.force) return 'network';
  // A request already running for this key is the freshest answer available.
  if (input.hasInflight) return 'join';
  if (input.hasSnapshot && input.ageMs < input.ttlMs) return 'cache';
  return 'network';
}

export function createRequestCache<T>(
  options: { ttlMs: number; now?: () => number }
): RequestCache<T> {
  const { ttlMs } = options;
  const now = options.now ?? (() => Date.now());
  const snapshots = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();

  function ageOf(key: string): number {
    const entry = snapshots.get(key);
    return entry ? now() - entry.storedAt : Infinity;
  }

  function load(key: string, fetcher: () => Promise<T>, force = false): Promise<T> {
    const decision = planLoad({
      force,
      hasInflight: inflight.has(key),
      hasSnapshot: snapshots.has(key),
      ageMs: ageOf(key),
      ttlMs,
    });

    if (decision === 'join') return inflight.get(key)!;
    if (decision === 'cache') return Promise.resolve(snapshots.get(key)!.value);

    const request = fetcher()
      .then((value) => {
        // Store only successful reads: a failed read must not be replayed from
        // cache (the UI has to be able to retry for real).
        snapshots.set(key, { value, storedAt: now() });
        return value;
      })
      .finally(() => {
        if (inflight.get(key) === request) inflight.delete(key);
      });

    inflight.set(key, request);
    return request;
  }

  return {
    peek: (key) => (ageOf(key) < ttlMs ? snapshots.get(key)?.value : undefined),
    ageOf,
    isFresh: (key) => snapshots.has(key) && ageOf(key) < ttlMs,
    hasInflight: (key) => inflight.has(key),
    size: () => snapshots.size,
    remember: (key, value) => snapshots.set(key, { value, storedAt: now() }),
    invalidate: (key) => {
      snapshots.delete(key);
    },
    clear: () => snapshots.clear(),
    load,
  };
}
