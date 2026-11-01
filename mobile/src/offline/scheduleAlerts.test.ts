import { describe, it, expect, vi } from 'vitest';
import { createScheduleAlerter, DEFAULT_ALERT_INTERVAL_MS } from './scheduleAlerts';

// The alerter must run entirely against LOCAL data: the fetch it is handed is the
// offline bridge, so a device with no network still evaluates its own schedules.

const SCHEDULES = {
  vehicle: { id: 'v-1', name: 'Corolla' },
  schedules: [
    { schedule: { id: 's-1' }, status: 'overdue', remainingKm: -500 },
    { schedule: { id: 's-2' }, status: 'due_soon', remainingKm: 400 },
    { schedule: { id: 's-3' }, status: 'ok', remainingKm: 9000 },
  ],
};

function localFetch() {
  return vi.fn(async (url: any) => {
    const u = String(url);
    if (u.startsWith('/api/vehicles')) {
      return new Response(JSON.stringify({ success: true, data: [{ id: 'v-1', name: 'Corolla' }] }), { status: 200 });
    }
    if (u.startsWith('/api/schedules')) {
      return new Response(JSON.stringify({ success: true, data: SCHEDULES }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: false, error: 'unexpected ' + u }), { status: 500 });
  }) as unknown as typeof fetch;
}

describe('offline schedule alert sweep', () => {
  it('reads local vehicles + schedules and hands the evaluated rows to the shared notifier', async () => {
    const notify = vi.fn();
    const fetchImpl = localFetch();
    const alerter = createScheduleAlerter({ fetchImpl, notify, lang: () => 'ar', now: () => 1000 });

    const run = await alerter.runOnce();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(SCHEDULES.schedules, 'Corolla', 'ar');
    expect(run.vehicles).toBe(1);
    expect(run.schedules).toBe(3);
    expect(run.urgent).toEqual({ overdue: 1, due_soon: 1 });
    expect(run.error).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalledWith(expect.stringContaining('http'));
    expect(alerter.getLastRun()).toEqual(run);
  });

  it('never rejects on a bad envelope, and records the notification capability', async () => {
    const failing = vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'boom' }), { status: 500 })) as unknown as typeof fetch;
    const run = await createScheduleAlerter({ fetchImpl: failing, notify: () => {} }).runOnce();
    expect(run.vehicles).toBe(0);
    expect(run.notifications.supported).toBe(false); // no Notification in node env
    expect(typeof run.at).toBe('number');
    expect(typeof run.notifications.permission).toBe('string');
  });

  it('sweeps on a timer and stops when torn down', async () => {
    vi.useFakeTimers();
    try {
      const notify = vi.fn();
      const alerter = createScheduleAlerter({
        fetchImpl: localFetch(), notify, intervalMs: DEFAULT_ALERT_INTERVAL_MS,
      });
      const stop = alerter.start();
      await alerter.runOnce();
      expect(notify).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(DEFAULT_ALERT_INTERVAL_MS);
      expect(notify).toHaveBeenCalledTimes(2);

      stop();
      await vi.advanceTimersByTimeAsync(DEFAULT_ALERT_INTERVAL_MS * 3);
      expect(notify).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
