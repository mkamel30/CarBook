import { describe, it, expect, beforeEach } from 'vitest';
import { pushOverlay, closeTopOverlay, overlayDepth, __clearOverlays } from './overlayStack';

beforeEach(() => __clearOverlays());

describe('overlay LIFO stack (§4 back button)', () => {
  it('closes the newest overlay first, then unwinds in reverse open order', () => {
    const order: string[] = [];
    pushOverlay(() => order.push('modal'));
    pushOverlay(() => order.push('confirm-on-top'));

    expect(overlayDepth()).toBe(2);
    expect(closeTopOverlay()).toBe(true); // confirm closes first
    expect(closeTopOverlay()).toBe(true); // then modal
    expect(order).toEqual(['confirm-on-top', 'modal']);
    expect(overlayDepth()).toBe(0);
  });

  it('reports nothing to close when empty (Back should exit)', () => {
    expect(overlayDepth()).toBe(0);
    expect(closeTopOverlay()).toBe(false);
  });

  it('pops before running the callback, so a double-press never closes twice', () => {
    let calls = 0;
    pushOverlay(() => { calls++; });
    closeTopOverlay();
    closeTopOverlay(); // stack already drained
    expect(calls).toBe(1);
  });

  it('unregister removes exactly its own entry and is idempotent', () => {
    let a = 0;
    let b = 0;
    const offA = pushOverlay(() => { a++; });
    pushOverlay(() => { b++; });

    offA();
    offA(); // second teardown must not drop B

    expect(overlayDepth()).toBe(1);
    closeTopOverlay();
    expect(b).toBe(1);
    expect(a).toBe(0);
  });

  it('a nested close (React cleanup) after an already-popped press drops nothing', () => {
    // closeTopOverlay already popped the entry; the effect cleanup that runs later
    // must be a no-op rather than removing a NEWER overlay pushed after the press.
    const offX = pushOverlay(() => {});
    closeTopOverlay(); // pops X and runs it
    pushOverlay(() => {}); // Y pushed after
    offX(); // X's cleanup fires late
    expect(overlayDepth()).toBe(1); // Y survives
  });
});
