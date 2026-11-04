// Android hardware Back handler (§4 lifecycle).
//
// Capacitor routes the native back press to ONE JS listener registered through the
// @capacitor/app plugin — there is no core-only way to intercept it, so this is the
// single decision point for "close an overlay vs exit the app". It defers entirely
// to the shared overlay stack (src/components/ui/overlayStack.ts): if an overlay was
// open, Back closes the topmost one; only when nothing is open does it let the OS
// finish the activity.
//
// Every side effect (native detection, the plugin listener, exitApp, the stack pop)
// is injected so the whole decision runs under node/vitest with doubles, exactly like
// the sync boot. All side effects stay injectable so the logic is testable.

export type Unsubscribe = () => void;

export interface BackButtonDeps {
  /** True only inside the Capacitor native shell; on web Back is the browser's own. */
  isNativePlatform: () => boolean;
  /** Register the native back listener. Capacitor returns a promise of a removable handle. */
  addBackListener: (cb: () => void) => Unsubscribe | Promise<Unsubscribe>;
  /** Ask the OS to finish the activity (nothing open to close). */
  exitApp: () => void;
  /** Close the topmost overlay; true = it closed something, false = stack was empty. */
  closeTop: () => boolean;
}

/** Install the handler; returns a teardown that unregisters the native listener. */
export function createBackHandler(deps: BackButtonDeps): Unsubscribe {
  // On web there is no hardware back; leave navigation to the browser.
  if (!deps.isNativePlatform()) return () => {};

  let teardown: Unsubscribe | null = null;
  let stopped = false;

  const press = () => {
    if (stopped) return;
    // Overlay open -> close it; nothing open -> exit, matching stock Android.
    if (!deps.closeTop()) deps.exitApp();
  };

  const registration = deps.addBackListener(press);
  if (typeof registration === 'function') {
    teardown = registration;
  } else {
    // Capacitor resolves the listener handle asynchronously; a teardown requested
    // before it lands must still remove it once it does (no orphan listener).
    void Promise.resolve(registration).then((off) => {
      if (stopped) off();
      else teardown = off;
    });
  }

  return () => {
    stopped = true;
    if (teardown) teardown();
    teardown = null;
  };
}
