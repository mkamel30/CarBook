// Data-safety evaluator + auto server-backup trigger (A2, parts 2 and 3).
//
// THE TWO GAPS THIS CLOSES
//   (2) A GUEST's rows exist in exactly one place: the WebView localStorage
//       snapshot (see storageGuard.ts). If they never sign in and the OS evicts
//       or they clear storage, that copy is gone with no second copy anywhere.
//       We cannot fix that in code — only tell them, plainly, that their data is
//       not yet backed up and that signing in creates a server copy.
//   (3) A SIGNED-IN, ONLINE device already has an upload path: the sync runtime
//       pushes every dirty row to the server on /api/sync, and the server's own
//       rows are what /api/backup exports. So "auto server-backup" is NOT a new
//       transport — it is making sure that path actually RUNS when the device is
//       signed in and back online. This module edge-triggers `runBackup` (which
//       the host wires to `boot.syncNow`) at exactly those moments, so the
//       server copy can never lag a signed-in user's local edits without a
//       reason. It reuses the boot's single sync transport; nothing is forked.
//
// WHY A SEPARATE EDGE TRIGGER, WHEN THE BOOT ALREADY LISTENS TO `online`:
// The boot's online/periodic/post-write triggers are the transport; they fire
// regardless of account. This watch adds only the ACCOUNT-aware decision layer
// — "run because this device is signed-in and online now" — and reports the
// outcome through `onAdvice`, so the UI can honestly say "backed up" / "not
// backed up". It never invents a second upload channel.
//
// Every side effect (online probe, online listener, signed-in probe, the backup
// run, the clock) is injected so the whole thing runs under node/vitest, the
// same rule-8 discipline as storageGuard / syncBoot / backButton.

/** The advice state the guest/signed-in banner is drawn from. */
export interface BackupAdvice {
  /** True when the user should see a "your data is not backed up yet" warning. */
  warning: boolean;
  /** True when a server copy is confirmed fresh (shown instead of the warning). */
  backedUp: boolean;
  /** Signed-in or guest — decides which message the banner carries. */
  guest: boolean;
  /** Rows still queued; drives the "waiting to upload" nuance for a signed-in device. */
  pendingCount: number;
  /** Dictionary key resolved by the caller in the user's current language. */
  messageKey: string;
}

export interface BackupAdviceInput {
  guest: boolean;
  pendingCount: number;
  /**
   * Whether a backup run has completed successfully since this module started.
   * A guest is never "backed up" (no server to back up to) regardless of this.
   */
  backedUpOnce: boolean;
}

/**
 * Pure: the exact banner text/state for a given device situation. No side
 * effects, so it is testable in isolation and can never drift from the trigger.
 */
export function evaluateBackupAdvice(input: BackupAdviceInput): BackupAdvice {
  const pending = Math.max(0, input.pendingCount);

  // Guest: no server account, so nothing is backed up no matter what we sync
  // locally — the whole point is to nudge them toward signing in.
  if (input.guest) {
    return {
      warning: true,
      backedUp: false,
      guest: true,
      pendingCount: pending,
      messageKey: 'set_data_not_backed_up',
    };
  }

  // Signed-in but the offline queue still holds rows: the server copy is behind.
  if (pending > 0) {
    return {
      warning: true,
      backedUp: false,
      guest: false,
      pendingCount: pending,
      messageKey: 'set_data_waiting_upload',
    };
  }

  // Signed-in, nothing waiting, and a backup has actually landed since boot.
  if (input.backedUpOnce) {
    return {
      warning: false,
      backedUp: true,
      guest: false,
      pendingCount: 0,
      messageKey: 'set_data_backed_up',
    };
  }

  // Signed-in with an empty queue but no confirmed run yet this session — stay
  // quiet rather than claim a backup we have not observed (rule 8: no false OK).
  return {
    warning: false,
    backedUp: false,
    guest: false,
    pendingCount: 0,
    messageKey: 'set_data_backed_up',
  };
}

export interface AutoBackupDeps {
  /** Is there a live account session right now? Read from the bearer store. */
  isSignedIn: () => boolean | Promise<boolean>;
  /** Connectivity probe (defaults to navigator.onLine in the web host). */
  isOnline?: () => boolean;
  /** Registers an `online` listener, returns teardown (host wires window events). */
  addOnlineListener?: (cb: () => void) => () => void;
  /**
   * THE backup run — the host passes `() => boot.syncNow()` so this reuses the
   * boot's single sync transport instead of opening a second upload path.
   */
  runBackup: () => void | Promise<unknown>;
  /** Latest advice written here after every evaluation / run. */
  onAdvice?: (advice: BackupAdvice) => void;
  /** Current pending queue size for the advice (host wires `boot.pendingCount()`). */
  readPending?: () => number | Promise<number>;
  /** Notified when a backup run fails, so the host can record it (rule 8). */
  onError?: (message: string) => void;
}

export interface AutoBackup {
  /** Register listeners + one immediate run if signed-in & online. Returns teardown. */
  start(): () => void;
  /** Re-evaluate now (e.g. the host learned the account changed). Never rejects. */
  refresh(): Promise<BackupAdvice>;
  /** True once a run has completed without throwing this session. */
  hasBackedUp(): boolean;
  getAdvice(): BackupAdvice;
}

function defaultOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') return navigator.onLine;
  return true;
}

function defaultAddOnlineListener(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
  const handler = () => cb();
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}

/**
 * Edge-triggered auto server-backup. It runs once at start when the device is
 * already signed-in & online, and again every time the connection returns to a
 * signed-in device. Concurrency is bounded: a run already in flight is awaited,
 * never stacked. It NEVER rejects.
 */
export function createAutoBackup(deps: AutoBackupDeps): AutoBackup {
  const isOnline = deps.isOnline ?? defaultOnline;
  const addOnlineListener = deps.addOnlineListener ?? defaultAddOnlineListener;
  const readPending = deps.readPending ?? (() => 0);

  let guest = true;
  let backedUpOnce = false;
  let inFlight: Promise<void> | null = null;
  let advice: BackupAdvice = evaluateBackupAdvice({ guest, pendingCount: 0, backedUpOnce });

  function publish(pending: number): BackupAdvice {
    advice = evaluateBackupAdvice({ guest, pendingCount: pending, backedUpOnce });
    try {
      deps.onAdvice?.(advice);
    } catch {
      // An observer must never break the trigger.
    }
    return advice;
  }

  async function evaluateOnly(): Promise<BackupAdvice> {
    let signed: boolean;
    try {
      signed = (await deps.isSignedIn()) === true;
    } catch {
      signed = false; // a failed read is "not signed in", the safe default
    }
    guest = !signed;
    let pending = 0;
    try {
      pending = await readPending();
    } catch {
      pending = 0;
    }
    return publish(pending);
  }

  /** One backup: run the transport, then re-evaluate with a fresh queue read. */
  function backup(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        await deps.runBackup();
        backedUpOnce = true;
      } catch (err) {
        deps.onError?.(err instanceof Error ? err.message : String(err));
      } finally {
        await evaluateOnly();
      }
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  /**
   * Backup only makes sense for a signed-in, online device. A guest has no
   * server to back up to, and offline cannot reach it — evaluate, warn, do not
   * spend a doomed round trip.
   */
  async function maybeBackup(): Promise<BackupAdvice> {
    let signed: boolean;
    try {
      signed = (await deps.isSignedIn()) === true;
    } catch {
      signed = false;
    }
    guest = !signed;
    if (!signed || !isOnline()) return publish(await safePending());
    await backup();
    return advice;
  }

  async function safePending(): Promise<number> {
    try {
      return await readPending();
    } catch {
      return 0;
    }
  }

  function start(): () => void {
    let torn = false;
    const off = addOnlineListener(() => { void maybeBackup(); });
    void maybeBackup();
    return () => {
      if (torn) return;
      torn = true;
      off();
    };
  }

  return {
    start,
    refresh: evaluateOnly,
    hasBackedUp: () => backedUpOnce,
    getAdvice: () => advice,
  };
}
