import { describe, it, expect, vi } from 'vitest';
import { requestPersistentStorage, webStorageManager, type PersistOutcome } from './storageGuard';

// The guard must never reject (rule 8) and must never break on an observer throw.
// Every platform call is injected, so this runs under plain node/vitest.

describe('requestPersistentStorage', () => {
  it('reports newlyGranted only when this call flips persistence on', async () => {
    const outcomes: PersistOutcome[] = [];
    const storage = {
      persisted: vi.fn(async () => false),
      persist: vi.fn(async () => true),
    };
    const r = await requestPersistentStorage({ storage, onOutcome: (o) => outcomes.push(o) });
    expect(r).toEqual({ supported: true, granted: true, newlyGranted: true });
    expect(storage.persist).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
  });

  it('a boot onto an already-persisted origin grants but is NOT "newly" granted', async () => {
    const storage = {
      persisted: vi.fn(async () => true),
      persist: vi.fn(async () => true),
    };
    const r = await requestPersistentStorage({ storage });
    expect(r.granted).toBe(true);
    expect(r.newlyGranted).toBe(false);
  });

  it('a declined persist (false, no throw) is a supported-but-not-granted state, not an error', async () => {
    const storage = { persisted: async () => false, persist: async () => false };
    const r = await requestPersistentStorage({ storage });
    expect(r).toEqual({ supported: true, granted: false, newlyGranted: false });
    expect(r.error).toBeUndefined();
  });

  it('no navigator.storage API => unsupported, no throw', async () => {
    const r = await requestPersistentStorage({ storage: null });
    expect(r).toEqual({ supported: false, granted: false, newlyGranted: false });
  });

  it('a persist() that rejects resolves with an explicit error and never rejects', async () => {
    const storage = { persist: async () => { throw new Error('gesture required'); } };
    const r = await requestPersistentStorage({ storage });
    expect(r.supported).toBe(true);
    expect(r.granted).toBe(false);
    expect(r.error).toBe('gesture required');
  });

  it('a persisted() probe that throws is treated as "unknown", not fatal', async () => {
    const storage = {
      persisted: async () => { throw new Error('boom'); },
      persist: async () => true,
    };
    const r = await requestPersistentStorage({ storage });
    expect(r.granted).toBe(true);
    expect(r.newlyGranted).toBe(true); // unknown prior state => this call counts as the grant
  });

  it('an onOutcome that throws must not break the returned outcome', async () => {
    const storage = { persist: async () => true };
    const r = await requestPersistentStorage({ storage, onOutcome: () => { throw new Error('observer died'); } });
    expect(r.granted).toBe(true);
  });
});

describe('webStorageManager', () => {
  it('returns null when navigator has no storage manager', () => {
    vi.stubGlobal('navigator', {});
    try {
      expect(webStorageManager()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns null when navigator itself is absent (node/SSR guard)', () => {
    vi.stubGlobal('navigator', undefined);
    try {
      expect(webStorageManager()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns the manager only when persist() is a function', () => {
    const storage = { persist: async () => true };
    vi.stubGlobal('navigator', { storage });
    try {
      expect(webStorageManager()).toBe(storage);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ignores a storage object that has no persist() function', () => {
    vi.stubGlobal('navigator', { storage: { persisted: async () => true } });
    try {
      expect(webStorageManager()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
