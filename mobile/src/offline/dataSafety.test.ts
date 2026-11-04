import { describe, it, expect, vi } from 'vitest';
import { createAutoBackup, evaluateBackupAdvice } from './dataSafety';

// evaluateBackupAdvice is the banner's single source of truth; createAutoBackup
// is the account-aware edge trigger. Both must never reject (rule 8) and the
// trigger must reuse the injected runBackup transport, never open its own channel.

describe('evaluateBackupAdvice', () => {
  it('a guest is ALWAYS warned, regardless of pending or a completed run', () => {
    expect(evaluateBackupAdvice({ guest: true, pendingCount: 0, backedUpOnce: true }))
      .toMatchObject({ warning: true, backedUp: false, guest: true, messageKey: 'set_data_not_backed_up' });
  });

  it('signed-in with rows still queued warns "waiting to upload" (server copy is behind)', () => {
    expect(evaluateBackupAdvice({ guest: false, pendingCount: 3, backedUpOnce: true }))
      .toMatchObject({ warning: true, backedUp: false, pendingCount: 3, messageKey: 'set_data_waiting_upload' });
  });

  it('signed-in, queue empty, and a run landed => the positive "backed up" state', () => {
    expect(evaluateBackupAdvice({ guest: false, pendingCount: 0, backedUpOnce: true }))
      .toMatchObject({ warning: false, backedUp: true, messageKey: 'set_data_backed_up' });
  });

  it('signed-in, queue empty, but NO run observed yet => no false "backed up" claim', () => {
    expect(evaluateBackupAdvice({ guest: false, pendingCount: 0, backedUpOnce: false }))
      .toMatchObject({ warning: false, backedUp: false });
  });

  it('clamps a negative pending figure to zero', () => {
    expect(evaluateBackupAdvice({ guest: false, pendingCount: -5, backedUpOnce: false }).pendingCount)
      .toBe(0);
  });
});

describe('createAutoBackup trigger', () => {
  const online = (v: boolean) => () => v;

  it('does NOT call the transport for a guest (no server to back up to)', async () => {
    const runBackup = vi.fn();
    const advice = vi.fn();
    const ab = createAutoBackup({
      isSignedIn: async () => false,
      isOnline: online(true),
      addOnlineListener: () => () => {},
      runBackup,
      onAdvice: advice,
    });
    await ab.refresh();
    const stop = ab.start();
    stop();
    expect(runBackup).not.toHaveBeenCalled();
    expect(advice).toHaveBeenCalled();
    expect(ab.getAdvice().guest).toBe(true);
  });

  it('does NOT call the transport when offline even if signed in', async () => {
    const runBackup = vi.fn();
    const ab = createAutoBackup({
      isSignedIn: async () => true,
      isOnline: online(false),
      addOnlineListener: () => () => {},
      runBackup,
    });
    ab.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(runBackup).not.toHaveBeenCalled();
    expect(ab.hasBackedUp()).toBe(false);
  });

  it('runs the injected backup transport once for a signed-in online device and marks backed up', async () => {
    const runBackup = vi.fn(async () => {});
    const ab = createAutoBackup({
      isSignedIn: async () => true,
      isOnline: online(true),
      addOnlineListener: () => () => {},
      runBackup,
      readPending: async () => 0,
    });
    ab.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(runBackup).toHaveBeenCalledTimes(1);
    expect(ab.hasBackedUp()).toBe(true);
    expect(ab.getAdvice()).toMatchObject({ warning: false, backedUp: true, messageKey: 'set_data_backed_up' });
  });

  it('fires again when the connection returns to a signed-in device', async () => {
    let onlineNow = false;
    let fire: (() => void) | null = null;
    const runBackup = vi.fn(async () => {});
    const ab = createAutoBackup({
      isSignedIn: async () => true,
      isOnline: () => onlineNow,
      addOnlineListener: (cb) => { fire = cb; return () => { fire = null; }; },
      runBackup,
    });
    ab.start(); // offline at start => no run
    await new Promise((r) => setTimeout(r, 0));
    expect(runBackup).not.toHaveBeenCalled();
    onlineNow = true;
    fire!(); // the `online` event now lands
    await new Promise((r) => setTimeout(r, 0));
    expect(runBackup).toHaveBeenCalledTimes(1);
  });

  it('a failed run is reported through onError and never rejects; advice stays un-backuped', async () => {
    const onError = vi.fn();
    const ab = createAutoBackup({
      isSignedIn: async () => true,
      isOnline: online(true),
      addOnlineListener: () => () => {},
      runBackup: async () => { throw new Error('sync exploded'); },
      onError,
    });
    ab.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalledWith('sync exploded');
    expect(ab.hasBackedUp()).toBe(false);
  });

  it('overlapping online events coalesce: an in-flight run is awaited, never stacked', async () => {
    const resolvers: Array<() => void> = [];
    const runBackup = vi.fn(() => new Promise<void>((res) => resolvers.push(res)));
    let fire: (() => void) | null = null;
    const ab = createAutoBackup({
      isSignedIn: async () => true,
      isOnline: online(true),
      addOnlineListener: (cb) => { fire = cb; return () => { fire = null; }; },
      runBackup,
    });
    ab.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(runBackup).toHaveBeenCalledTimes(1); // the boot run is still in flight (unresolved)
    fire!(); // a second `online` arrives before the first run resolves
    fire!(); // and a third
    await new Promise((r) => setTimeout(r, 0));
    expect(runBackup).toHaveBeenCalledTimes(1); // they await the same in-flight run, no stack
    resolvers.forEach((res) => res());
    await new Promise((r) => setTimeout(r, 0));
    expect(ab.hasBackedUp()).toBe(true);
  });

  it('a thrown isSignedIn read defaults to guest (the safe, warning-showing state)', async () => {
    const ab = createAutoBackup({
      isSignedIn: async () => { throw new Error('storage read broke'); },
      isOnline: online(true),
      addOnlineListener: () => () => {},
      runBackup: () => {},
    });
    const a = await ab.refresh();
    expect(a.guest).toBe(true);
    expect(a.warning).toBe(true);
  });
});
