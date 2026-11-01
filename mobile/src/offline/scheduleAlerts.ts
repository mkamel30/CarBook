// Offline maintenance reminders — no server, no new dependencies.
//
// The shared page already fires device notifications from LOCAL schedule data on
// every vehicle load (page.tsx -> evaluateAndNotifySchedules over
// /api/schedules, which the fetch bridge answers from WatermelonDB). What it does
// NOT do is re-check while the app just sits open: the reminder is a
// mount-time-only sweep, so an odometer change made after mount goes unreported.
//
// This module is the shell-side scheduler: it periodically sweeps the device's
// own vehicles through the SAME bridge endpoints and hands the evaluated rows to
// the SAME shared service function (src/services/notifications.ts, imported,
// never forked). The shared throttle (once per 6h per vehicle, localStorage) and
// the permission check stay inside that function, so nothing about prompting
// behaviour can drift from the web app.
//
// Honest platform limitation, recorded rather than hidden (see getLastAlertRun):
// src/services/notifications.ts uses the Web Notifications API. On Android that
// API is a browser feature: in an app-owned WebView it is commonly absent
// (`'Notification' in window === false`), and even where present it cannot wake
// a closed app nor create the Android 8+ (O) NotificationChannel a posted
// notification needs. Background delivery therefore needs
// @capacitor/local-notifications — deliberately NOT installed here (dependency
// pinning: owner approval required). Everything else here still works offline:
// the sweep, the evaluation, and the due/overdue data the in-app tabs render.

import { evaluateAndNotifySchedules, checkNotificationSupport } from '@app/services/notifications';

export interface AlertRun {
  at: number;
  vehicles: number;
  /** Rows the shared evaluator saw, across all vehicles. */
  schedules: number;
  /** 'overdue' | 'due_soon' | 'ok' tallies for the last sweep. */
  urgent: { overdue: number; due_soon: number };
  /** Web Notifications availability at sweep time (permission + support). */
  notifications: { supported: boolean; permission: string };
  error?: string;
}

export interface ScheduleAlertDeps {
  /** Defaults to window.fetch — already the offline bridge. */
  fetchImpl?: typeof fetch;
  /** Language for the shared alert copy; defaults to the app's stored 'carbook_lang'. */
  lang?: () => string;
  now?: () => number;
  /** Sweep period; default 30 minutes (the shared throttle is 6h, so no spam). */
  intervalMs?: number;
  /** Injectable alert sink so tests never need a Notification constructor. */
  notify?: (schedules: any[], vehicleName: string, lang: string) => void;
  onRun?: (run: AlertRun) => void;
}

export const DEFAULT_ALERT_INTERVAL_MS = 30 * 60 * 1000;

function webLang(): string {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('carbook_lang') || 'ar' : 'ar';
  } catch {
    return 'ar';
  }
}

async function readEnvelope(fetchImpl: typeof fetch, url: string): Promise<any | null> {
  try {
    const res = await fetchImpl(url);
    const body = await res.json();
    return body && body.success ? body.data : null;
  } catch {
    return null;
  }
}

export interface ScheduleAlerter {
  /** One sweep now; resolves with what it found (never rejects). */
  runOnce(): Promise<AlertRun>;
  /** Immediate sweep + periodic sweeps; returns the teardown. */
  start(): () => void;
  getLastRun(): AlertRun | null;
}

export function createScheduleAlerter(deps: ScheduleAlertDeps = {}): ScheduleAlerter {
  const doFetch: typeof fetch | undefined =
    deps.fetchImpl ?? (typeof window !== 'undefined' ? window.fetch.bind(window) : undefined);
  const lang = deps.lang ?? webLang;
  const now = deps.now ?? (() => Date.now());
  const intervalMs = deps.intervalMs ?? DEFAULT_ALERT_INTERVAL_MS;
  const notify = deps.notify ?? evaluateAndNotifySchedules;

  let last: AlertRun | null = null;
  let inFlight: Promise<AlertRun> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function sweep(): Promise<AlertRun> {
    const run: AlertRun = {
      at: now(),
      vehicles: 0,
      schedules: 0,
      urgent: { overdue: 0, due_soon: 0 },
      notifications: checkNotificationSupport(),
    };
    if (!doFetch) {
      run.error = 'no fetch transport available';
      last = run;
      deps.onRun?.(run);
      return run;
    }
    try {
      const vehicles = (await readEnvelope(doFetch, '/api/vehicles')) ?? [];
      run.vehicles = Array.isArray(vehicles) ? vehicles.length : 0;
      for (const v of Array.isArray(vehicles) ? vehicles : []) {
        const data = await readEnvelope(doFetch, `/api/schedules?vehicleId=${encodeURIComponent(v.id)}`);
        const evaluated: any[] = data?.schedules ?? [];
        run.schedules += evaluated.length;
        for (const s of evaluated) {
          if (s?.status === 'overdue') run.urgent.overdue++;
          else if (s?.status === 'due_soon') run.urgent.due_soon++;
        }
        // The shared evaluator: same filters, same 6h throttle, same copy.
        notify(evaluated, data?.vehicle?.name || v.name || '', lang());
      }
    } catch (err) {
      run.error = err instanceof Error ? err.message : String(err);
    }
    last = run;
    deps.onRun?.(run);
    return run;
  }

  function runOnce(): Promise<AlertRun> {
    if (!inFlight) {
      inFlight = sweep().finally(() => { inFlight = null; });
    }
    return inFlight;
  }

  function start(): () => void {
    void runOnce().catch(() => {});
    timer = setInterval(() => { void runOnce().catch(() => {}); }, intervalMs);
    // A browser/WebView tab that was asleep should re-check the moment it is seen.
    const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void runOnce().catch(() => {}); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearInterval(timer);
      timer = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }

  return { runOnce, start, getLastRun: () => last };
}
