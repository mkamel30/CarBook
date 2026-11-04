import { describe, expect, it, vi } from 'vitest';
import {
  ApkInstallResult,
  ApkUpdaterProgress,
  UpdaterPluginRef,
  classifyInstall,
  percentOf,
  progressKeyFor,
  runApkUpdate,
  shouldHandOffToBrowser,
} from '@/services/apkUpdater';

const URL = 'https://github.com/mkamel30/CarBook/releases/download/v1.3.0/CarBook-v1.3.0.apk';
const SHA = 'c176d6b0742f496442acfaa6e99be74954ee2ed732583681f726108b5217c6b4';

interface FakeOptions {
  result?: ApkInstallResult;
  error?: { code?: string; message?: string };
  /** Events the fake pushes to the registered progress listener before resolving. */
  emit?: ApkUpdaterProgress[];
  listenerFailure?: boolean;
}

function fakePlugin(options: FakeOptions = {}): UpdaterPluginRef & {
  calls: any[];
  events: ApkUpdaterProgress[];
} {
  const state = { calls: [] as any[], events: [] as ApkUpdaterProgress[] };
  let listener: ((event: ApkUpdaterProgress) => void) | null = null;
  const plugin: UpdaterPluginRef & typeof state = {
    calls: state.calls,
    events: state.events,
    async addListener(_name: 'progress', callback: (event: ApkUpdaterProgress) => void) {
      if (options.listenerFailure) throw new Error('listener rejected');
      listener = callback;
      return { remove: () => { listener = null; } };
    },
    async downloadAndInstall(args: any) {
      plugin.calls.push(args);
      for (const event of options.emit ?? []) listener?.(event);
      if (options.error) throw options.error;
      return options.result ?? { phase: 'install_prompt', installLaunched: true, canInstall: true };
    },
    async canRequestInstall() {
      return { allowed: true };
    },
    async openInstallPermissionSettings() {},
  } as any;
  return plugin;
}

describe('runApkUpdate — transport decision tree', () => {
  it('takes the browser handoff when there is no native plugin, and downloads nothing', async () => {
    const handoff = vi.fn();
    const run = await runApkUpdate({ plugin: null, apkUrl: URL, onBrowserHandoff: handoff });
    expect(run.outcome).toBe('browser_handoff');
    expect(handoff).toHaveBeenCalledWith(URL);
  });

  it('reports the install prompt without falling back to the browser', async () => {
    const handoff = vi.fn();
    const plugin = fakePlugin({ result: { phase: 'install_prompt', installLaunched: true, canInstall: true, sha256: SHA, verified: true } });
    const run = await runApkUpdate({ plugin, apkUrl: URL, expectedSha256: SHA, onBrowserHandoff: handoff });
    expect(run.outcome).toBe('install_prompt');
    expect(handoff).not.toHaveBeenCalled();
    // The digest the server advertised is what the plugin is asked to check against.
    expect(plugin.calls[0]).toEqual({ url: URL, expectedSha256: SHA, autoInstall: true });
    expect(run.detail?.verified).toBe(true);
  });

  it('refuses to hand a digest-matched-failure to the browser', async () => {
    // The browser would re-download the exact bytes the native check rejected,
    // so integrity_failed must be the one outcome with no handoff.
    const handoff = vi.fn();
    const plugin = fakePlugin({ error: { code: 'SHA256_MISMATCH', message: 'digest differs' } });
    const run = await runApkUpdate({ plugin, apkUrl: URL, expectedSha256: SHA, onBrowserHandoff: handoff });
    expect(run.outcome).toBe('integrity_failed');
    expect(shouldHandOffToBrowser(run.outcome)).toBe(false);
    expect(handoff).not.toHaveBeenCalled();
  });

  it('offers both the permission screen route and a browser escape when installs are blocked', async () => {
    const handoff = vi.fn();
    const plugin = fakePlugin({ result: { phase: 'downloaded', installLaunched: false, canInstall: false, sha256: SHA, verified: true } });
    const run = await runApkUpdate({ plugin, apkUrl: URL, expectedSha256: SHA, onBrowserHandoff: handoff });
    expect(run.outcome).toBe('permission_required');
    expect(shouldHandOffToBrowser(run.outcome)).toBe(true);
    expect(handoff).toHaveBeenCalledWith(URL);
  });

  it('classifies a transport failure as failed, not as an integrity problem', async () => {
    const handoff = vi.fn();
    const plugin = fakePlugin({ error: { code: 'DOWNLOAD_TIMEOUT', message: 'too slow' } });
    const run = await runApkUpdate({ plugin, apkUrl: URL, onBrowserHandoff: handoff });
    expect(run.outcome).toBe('failed');
    expect(run.error?.code).toBe('DOWNLOAD_TIMEOUT');
    expect(handoff).toHaveBeenCalledWith(URL);
  });

  it('treats a rejection with no code as a plain failure', async () => {
    const plugin = fakePlugin({ error: { message: 'boom' } });
    const run = await runApkUpdate({ plugin, apkUrl: URL, onBrowserHandoff: () => {} });
    expect(run.outcome).toBe('failed');
    expect(run.error?.code).toBeUndefined();
  });

  it('forwards progress events to the caller and drops the listener afterwards', async () => {
    const seen: ApkUpdaterProgress[] = [];
    const plugin = fakePlugin({
      emit: [
        { phase: 'downloading', percent: 30, totalBytes: 4_000_000 },
        { phase: 'verifying', percent: 100, totalBytes: 4_000_000 },
      ],
    });
    const run = await runApkUpdate({ plugin, apkUrl: URL, onProgress: (e) => seen.push(e), onBrowserHandoff: () => {} });
    expect(seen.map((e) => e.phase)).toEqual(['downloading', 'verifying']);
    expect(run.outcome).toBe('install_prompt');
  });

  it('still downloads when the progress listener cannot be attached', async () => {
    // Progress is cosmetic; refusing the whole update over it would brick the channel.
    const plugin = fakePlugin({ listenerFailure: true });
    const run = await runApkUpdate({ plugin, apkUrl: URL, onProgress: () => {}, onBrowserHandoff: () => {} });
    expect(plugin.calls).toHaveLength(1);
    expect(run.outcome).toBe('install_prompt');
  });

  it('passes a null digest through when the server advertised none', async () => {
    const plugin = fakePlugin();
    await runApkUpdate({ plugin, apkUrl: URL, expectedSha256: undefined, onBrowserHandoff: () => {} });
    expect(plugin.calls[0].expectedSha256).toBeNull();
  });
});

describe('classifyInstall / label helpers', () => {
  it('fails closed on an empty result', () => {
    expect(classifyInstall(null, null)).toBe('failed');
  });

  it('prefers a launched install over the canInstall flag', () => {
    expect(classifyInstall({ phase: 'install_prompt', installLaunched: true, canInstall: false }, null))
      .toBe('install_prompt');
  });

  it('maps phases onto translation keys', () => {
    expect(progressKeyFor({ phase: 'queued' })).toBe('update_progress_downloading');
    expect(progressKeyFor({ phase: 'downloading' })).toBe('update_progress_downloading');
    expect(progressKeyFor({ phase: 'paused' })).toBe('update_progress_paused');
    expect(progressKeyFor({ phase: 'verifying' })).toBe('update_progress_verifying');
    expect(progressKeyFor({ phase: 'install_prompt' })).toBeNull();
    expect(progressKeyFor(null)).toBeNull();
  });

  it('clamps a percent the native layer could not compute', () => {
    expect(percentOf({ phase: 'downloading', percent: 150 })).toBe(100);
    expect(percentOf({ phase: 'downloading', percent: -5 })).toBe(0);
    expect(percentOf({ phase: 'downloading', percent: 42.6 })).toBe(43);
    expect(percentOf({ phase: 'downloading' })).toBeNull();
    expect(percentOf({ phase: 'downloading', percent: Number.NaN })).toBeNull();
  });
});
