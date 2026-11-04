// Overlay LIFO stack (§4 lifecycle).
//
// Android hardware Back must close the TOPMOST open overlay (modal > confirm >
// dropdown > FAB menu) instead of exiting the app, and only let the OS finish the
// activity when nothing is open. Capacitor delivers the native back press to
// exactly one JS handler (see mobile/src/offline/backButton.ts), so the shared UI
// needs a single ordered registry of "how to close the thing you opened".
//
// Overlays push their close callback when they open and pop it when they close;
// closeTopOverlay() pops the newest entry and runs it. Deliberately React-free and
// dependency-free so it is unit-testable under Node and identical in the WebView.
//
// Web note: the web app never calls closeTopOverlay (nothing pops this stack in a
// browser), so registering here is inert on web — pure additive support for the
// device Back gesture. Nested overlays (e.g. a ConfirmDialog opened on top of a
// Modal) close one-at-a-time in the correct order because push order == open order.

type Close = () => void;

const stack: Close[] = [];

/**
 * Register an overlay's close callback (call when it opens). Returns an idempotent
 * unregister used when the overlay closes or unmounts.
 */
export function pushOverlay(close: Close): () => void {
  stack.push(close);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const i = stack.indexOf(close);
    if (i >= 0) stack.splice(i, 1);
  };
}

/**
 * Close the newest open overlay. Returns true if it closed something (the caller
 * should then NOT exit the app) and false when the stack is empty.
 *
 * Pops BEFORE running the callback so a fast double-press can never act on a
 * close that is already in flight, and so the later unregister (React cleanup)
 * finds nothing to remove instead of dropping a newer overlay off the top.
 */
export function closeTopOverlay(): boolean {
  const close = stack.pop();
  if (!close) return false;
  close();
  return true;
}

/** Current open-overlay depth (0 = nothing open, Back may exit). */
export function overlayDepth(): number {
  return stack.length;
}

/** TEST SEAM: drop every registration so a case never leaks overlay state. */
export function __clearOverlays(): void {
  stack.length = 0;
}
