import { describe, it, expect } from 'vitest';
import { makeDatabase } from '@device/database';
import type { SessionStore, StoredSession } from '@device/session';
import {
  createSyncBoot,
  DEFAULT_AUTO_SYNC_MS,
  DEFAULT_DIRTY_POLL_MS,
  DEFAULT_SYNC_INTERVAL_MS,
  type DeviceIdStore,
} from './syncBoot';

// A3: the post-write trigger is the write-event bus, not a fast poll. The boot
// is driven here purely through its injectable seams — a captured write callback,
// a fake timer registry (so nothing real fires), an injected connectivity gate and
// a queue double — so the whole flow runs under Node with no transport.

interface ArmedTimer { ms: number; cb: () => void; cancelled: boolean; }

function makeHarness() {
  const timers: ArmedTimer[] = [];
  let writeCb: (() => void) | null = null;
  let queue = 0;

  const sessionStore: SessionStore = {
    async load(): Promise<StoredSession | null> { return null; },
    async save() {},
    async clear() {},
  };
  const deviceIdStore: DeviceIdStore = {
    async load() { return 'test-device'; },
    async save() {},
  };

  const boot = createSyncBoot({
    db: makeDatabase(),
    sessionStore,
    deviceIdStore,
    baseUrl: 'https://srv.test',
    // Stay "offline" so boot/scheduled runs short-circuit before the transport;
    // A3 is about trigger wiring, not the sync body.
    isOnline: () => false,
    countDirty: () => queue,
    autoSyncMs: DEFAULT_AUTO_SYNC_MS,
    syncIntervalMs: DEFAULT_SYNC_INTERVAL_MS,
    dirtyPollMs: DEFAULT_DIRTY_POLL_MS,
    setTimer: (cb, ms) => {
      const t: ArmedTimer = { ms, cb, cancelled: false };
      timers.push(t);
      return () => { t.cancelled = true; };
    },
    addWriteListener: (cb) => { writeCb = cb; return () => { writeCb = null; }; },
    addOnlineListener: () => () => {},
    addVisibilityListener: () => () => {},
  });

  const settle = () => new Promise((r) => setTimeout(r, 0));

  return {
    boot,
    // The single live debounce timer is whatever scheduleAuto last armed at autoSyncMs.
    liveAutoTimers: () => timers.filter((t) => t.ms === DEFAULT_AUTO_SYNC_MS && !t.cancelled).length,
    fireWrite: () => {
      if (!writeCb) throw new Error('no write listener registered');
      writeCb();
    },
    setQueue: (n: number) => { queue = n; },
    settle,
  };
}

describe('sync boot: write-event driven (A3)', () => {
  it('demotes the outbox poll to a slow safety net (no longer 800ms)', () => {
    expect(DEFAULT_DIRTY_POLL_MS).toBe(30_000);
  });

  it('registers the write listener on start and unsubscribes it on stop', () => {
    const h = makeHarness();
    const stop = h.boot.start();
    expect(() => h.fireWrite()).not.toThrow();
    stop();
    expect(() => h.fireWrite()).toThrow();
  });

  it('a write arms the debounce once; a burst coalesces into ONE live timer', () => {
    const h = makeHarness();
    h.boot.start();
    h.fireWrite();
    expect(h.liveAutoTimers()).toBe(1);
    h.fireWrite();
    h.fireWrite();
    // scheduleAuto cancels the previous debounce, so a burst never stacks runs.
    expect(h.liveAutoTimers()).toBe(1);
  });

  it('a write refreshes the pending count the chip shows', async () => {
    const h = makeHarness();
    h.setQueue(3);
    h.boot.start();
    // Boot's own run (offline) does not sample; the write event's pollOutbox does.
    expect(h.boot.getStatus().pendingCount).toBeNull();
    h.fireWrite();
    await h.settle();
    expect(h.boot.getStatus().pendingCount).toBe(3);
  });
});
