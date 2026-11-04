import { describe, it, expect } from 'vitest';
import { createBackHandler, type BackButtonDeps } from './backButton';

function harness(over: Partial<BackButtonDeps> = {}) {
  const calls: string[] = [];
  let press: (() => void) | null = null;
  const deps: BackButtonDeps = {
    isNativePlatform: () => true,
    addBackListener: (cb) => { press = cb; return () => { press = null; }; },
    exitApp: () => { calls.push('exit'); },
    closeTop: () => { const open = openCount > 0; if (open) openCount--; calls.push('closeTop'); return open; },
    ...over,
  };
  let openCount = 0;
  return {
    deps,
    setOpen: (n: number) => { openCount = n; },
    fireBack: () => { if (!press) throw new Error('no listener registered'); press(); },
    calls,
    listenerRegistered: () => press !== null,
  };
}

describe('android back handler (§4)', () => {
  it('installs nothing on web', () => {
    const h = harness({ isNativePlatform: () => false });
    const off = createBackHandler(h.deps);
    expect(h.listenerRegistered()).toBe(false);
    expect(() => off()).not.toThrow();
  });

  it('closes the topmost overlay and does NOT exit while one is open', () => {
    const h = harness();
    createBackHandler(h.deps);
    h.setOpen(2);
    h.fireBack();
    expect(h.calls).toEqual(['closeTop']);
    // still one overlay open -> no exit
  });

  it('exits only once the last overlay is closed', () => {
    const h = harness();
    createBackHandler(h.deps);
    h.setOpen(1);
    h.fireBack(); // closes the last overlay
    h.fireBack(); // nothing open now
    expect(h.calls).toEqual(['closeTop', 'closeTop', 'exit']);
  });

  it('exits immediately when nothing is open', () => {
    const h = harness();
    createBackHandler(h.deps);
    h.setOpen(0);
    h.fireBack();
    expect(h.calls).toEqual(['closeTop', 'exit']);
  });

  it('resolves an async listener handle and still tears it down', async () => {
    let removed = false;
    let cb: (() => void) | null = null;
    const off = createBackHandler({
      isNativePlatform: () => true,
      addBackListener: (c) => { cb = c; return Promise.resolve(() => { removed = true; }); },
      exitApp: () => {},
      closeTop: () => false,
    });
    await Promise.resolve(); // let the handle land
    expect(cb).not.toBeNull();
    off();
    expect(removed).toBe(true);
  });

  it('a teardown requested before the async handle lands still removes it later', async () => {
    let removed = false;
    const off = createBackHandler({
      isNativePlatform: () => true,
      addBackListener: () => Promise.resolve(() => { removed = true; }),
      exitApp: () => {},
      closeTop: () => false,
    });
    off(); // stop before the promise resolves
    await Promise.resolve();
    expect(removed).toBe(true); // no orphan listener
  });
});
