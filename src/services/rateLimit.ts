import { NextRequest, NextResponse } from 'next/server';

/**
 * In-memory sliding-window rate limiter (T6).
 *
 * Deliberately NOT global middleware: each guarded route calls `check()` at
 * its own top, so feature traffic never passes through a shared pipeline and
 * an unguarded route keeps its existing behaviour. State lives in a bounded
 * Map per limiter instance (one instance per route or route family), keyed by
 * client identity; a stale key is pruned on touch and whole entries are
 * evicted once the map hits its cap, so memory cannot grow without bound.
 *
 * Single-process assumption: this is a self-hosted local-first app with one
 * Node server, so a process-local counter is coherent. A multi-worker deploy
 * would get per-worker budgets (documented trade-off, still strictly better
 * than no limiting).
 */

export interface RateLimiterOptions {
  /** Max allowed calls per window. */
  limit: number;
  /** Sliding window length in milliseconds. Injectable so tests (and any
   *  future tuning) do not have to wait out a real minute. */
  windowMs: number;
  /** Max tracked keys before eviction kicks in. Bounds the Map size. */
  maxKeys?: number;
  /** Clock injection point for tests. Defaults to Date.now. */
  now?: () => number;
}

export interface RateOutcome {
  allowed: boolean;
  /** Milliseconds until the oldest hit in the window leaves it. 0 when allowed. */
  retryAfterMs: number;
  /** Requests left in the current window (0 when blocked). */
  remaining: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateOutcome>;
  /** Drop all state. For tests and admin tooling only. */
  reset(): void;
  size(): number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs } = options;
  const maxKeys = options.maxKeys ?? 10_000;
  const now = options.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();

  return {
    async check(key: string): Promise<RateOutcome> {
      const t = now();
      const cutoff = t - windowMs;

      // Opportunistic global sweep when the map is full: drop keys whose every
      // hit has already aged out, then (if still full) the oldest-touched key.
      if (hits.size >= maxKeys && !hits.has(key)) {
        for (const [k, arr] of hits) {
          const live = arr.filter((ts) => ts > cutoff);
          if (live.length === 0) hits.delete(k);
          else if (live.length !== arr.length) hits.set(k, live);
        }
        if (hits.size >= maxKeys && !hits.has(key)) {
          let oldestKey: string | null = null;
          let oldest = Infinity;
          for (const [k, arr] of hits) {
            const last = arr[arr.length - 1];
            if (last < oldest) {
              oldest = last;
              oldestKey = k;
            }
          }
          if (oldestKey !== null) hits.delete(oldestKey);
        }
      }

      const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        const retryAfterMs = recent[0] + windowMs - t;
        return { allowed: false, retryAfterMs, remaining: 0 };
      }

      recent.push(t);
      hits.set(key, recent);
      return { allowed: true, retryAfterMs: 0, remaining: limit - recent.length };
    },
    reset() {
      hits.clear();
    },
    size() {
      return hits.size;
    },
  };
}

/**
 * Best-effort client address for rate limiting.
 *
 * Takes the first hop of X-Forwarded-For, which is what the app's reverse
 * proxy (Caddy/nginx in front of localhost:3070) appends. ADVISORY ONLY: if
 * the server is ever reached without a trusted proxy overwriting that header,
 * a client can spoof it. That is acceptable for abuse throttling — the worst
 * case is an attacker spending random IPs to buy quota — but this value must
 * never feed a security decision.
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

/** Standard 429 body with Retry-After (whole seconds, minimum 1). */
export function buildRateLimitResponse(outcome: RateOutcome): NextResponse {
  return NextResponse.json(
    { success: false, error: 'rate_limited' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil(outcome.retryAfterMs / 1000))) },
    }
  );
}

// ---------------------------------------------------------------------------
// Shared instances. Separate per route so hammering one endpoint cannot lock
// a user out of another (e.g. a stuck login retry must not block token-login
// completion mid-handoff).
// ---------------------------------------------------------------------------

/** /api/auth/login — starts an OAuth handoff; 10/min per IP. */
export const loginLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

/** /api/auth/token-login — deep-link code/token redemption; 10/min per IP. */
export const tokenLoginLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

/** /api/auth/device — register + refresh; 20/min per IP (a phone may
 *  legitimately refresh twice per app open when several devices share NAT). */
export const deviceAuthLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/** /api/ai/* — expensive Gemini calls; 10/min per user per endpoint. The
 *  guard runs before auth resolves, so anonymous traffic keys by IP. */
export const aiLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

/**
 * One-liner guard for the AI routes (T6, additive): call it at the very top
 * of the handler and return the response when non-null. Budget is 10/min per
 * user per endpoint; anonymous callers key by IP (they will still hit the
 * route's own 401 afterwards — the guard just stops anonymous spam).
 */
export async function aiRateGuard(req: NextRequest, endpoint: string): Promise<NextResponse | null> {
  // Imported lazily-ish at call level to keep this module free of auth logic;
  // identity only feeds a throttle, never an authorization decision.
  const { getAuthenticatedUser } = await import('./auth');
  const identity = getAuthenticatedUser(req)?.id ?? `ip:${getClientIp(req)}`;
  const outcome = await aiLimiter.check(`${endpoint}|${identity}`);
  return outcome.allowed ? null : buildRateLimitResponse(outcome);
}
