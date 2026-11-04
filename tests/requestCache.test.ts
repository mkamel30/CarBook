import { describe, it, expect, vi } from 'vitest';
import { planLoad, createRequestCache, type RequestCache } from '@/hooks/requestCache';

describe('planLoad — the whole caching policy in one pure rule', () => {
  it('force always goes to the network, even with a fresh snapshot and an in-flight request', () => {
    expect(planLoad({ force: true, hasInflight: true, hasSnapshot: true, ageMs: 0, ttlMs: 60_000 })).toBe('network');
  });

  it('an in-flight request is joined before any snapshot is considered', () => {
    expect(planLoad({ force: false, hasInflight: true, hasSnapshot: true, ageMs: 0, ttlMs: 60_000 })).toBe('join');
  });

  it('a fresh snapshot is served from cache', () => {
    expect(planLoad({ force: false, hasInflight: false, hasSnapshot: true, ageMs: 100, ttlMs: 60_000 })).toBe('cache');
  });

  it('an expired snapshot is NOT served from cache', () => {
    expect(planLoad({ force: false, hasInflight: false, hasSnapshot: true, ageMs: 60_001, ttlMs: 60_000 })).toBe('network');
  });

  it('no snapshot and no in-flight means network', () => {
    expect(planLoad({ force: false, hasInflight: false, hasSnapshot: false, ageMs: Infinity, ttlMs: 60_000 })).toBe('network');
  });
});

describe('createRequestCache', () => {
  function makeCache(ttlMs: number, startAt: number) {
    let clock = startAt;
    const cache = createRequestCache<string>({ ttlMs, now: () => clock });
    return {
      cache,
      tick: (ms: number) => { clock += ms; },
    };
  }

  it('dedupes concurrent reads of the same key into one fetcher call', async () => {
    const { cache } = makeCache(0, 0);
    const fetcher = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 'value';
    });

    const [a, b] = await Promise.all([cache.load('k', fetcher), cache.load('k', fetcher)]);
    expect(a).toBe('value');
    expect(b).toBe('value');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('force bypasses the in-flight join and starts a second request', async () => {
    const { cache } = makeCache(0, 0);
    let resolveFirst!: (v: string) => void;
    const fetcher = vi.fn(async () => new Promise<string>((r) => { resolveFirst = r; }));

    const first = cache.load('k', fetcher);
    const forced = cache.load('k', () => Promise.resolve('fresh'), true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolveFirst('stale');
    expect(await first).toBe('stale');
    expect(await forced).toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves a fresh snapshot from cache without calling the fetcher again', async () => {
    const { cache, tick } = makeCache(60_000, 0);
    const fetcher = vi.fn(async () => 'v1');

    expect(await cache.load('k', fetcher)).toBe('v1');
    tick(1_000);
    expect(await cache.load('k', fetcher)).toBe('v1');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches once the snapshot exceeds the ttl', async () => {
    const { cache, tick } = makeCache(60_000, 0);
    const fetcher = vi.fn(async () => 'v1');

    await cache.load('k', fetcher);
    tick(60_001);
    await cache.load('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('ttl=0 means dedupe-only: a completed read is never replayed from cache', async () => {
    const { cache } = makeCache(0, 0);
    const fetcher = vi.fn(async () => 'v');
    await cache.load('k', fetcher);
    await cache.load('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('a failed read is not cached, so a retry really hits the network', async () => {
    const { cache } = makeCache(60_000, 0);
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');

    await expect(cache.load('k', fetcher)).rejects.toThrow('boom');
    expect(await cache.load('k', fetcher)).toBe('recovered');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cache.size()).toBe(1);
  });

  it('invalidate drops the snapshot so the next read refetches', async () => {
    const { cache } = makeCache(60_000, 0);
    const fetcher = vi.fn(async () => 'v');
    await cache.load('k', fetcher);
    expect(cache.isFresh('k')).toBe(true);

    cache.invalidate('k');
    expect(cache.isFresh('k')).toBe(false);
    expect(cache.peek('k')).toBeUndefined();
  });

  it('exposes remember / peek / ageOf / hasInflight / clear diagnostics', async () => {
    const { cache, tick } = makeCache(60_000, 0);

    expect(cache.peek('k')).toBeUndefined();
    expect(cache.ageOf('k')).toBe(Infinity);

    cache.remember('k', 'seeded');
    expect(cache.peek('k')).toBe('seeded');
    expect(cache.isFresh('k')).toBe(true);
    expect(cache.size()).toBe(1);

    tick(60_001);
    expect(cache.peek('k')).toBeUndefined();
    expect(cache.isFresh('k')).toBe(false);

    let settle!: (v: string) => void;
    const inflight = cache.load('k2', () => new Promise<string>((r) => { settle = r; }));
    expect(cache.hasInflight('k2')).toBe(true);
    settle('done');
    await inflight;
    expect(cache.hasInflight('k2')).toBe(false);

    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
