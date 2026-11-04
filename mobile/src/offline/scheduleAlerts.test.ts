import { describe, it, expect, vi } from 'vitest';
import { createScheduleAlerter, DEFAULT_ALERT_INTERVAL_MS } from './scheduleAlerts';

// The alerter must run entirely against LOCAL data: the fetch it is handed is the
// offline bridge, so a device with no network still evaluates its own schedules.

const SCHEDULES = {
  vehicle: { id: 'v-1', name: 'Corolla', currentOdometer: 10500 },
  schedules: [
    { schedule: { id: 's-1' }, status: 'overdue', remainingKm: -500 },
    { schedule: { id: 's-2' }, status: 'due_soon', remainingKm: 400 },
    { schedule: { id: 's-3' }, status: 'ok', remainingKm: 9000 },
  ],
};

const FUEL = [
  { odometer: 10000, fillDate: '2026-11-01' },
  { odometer: 10500, fillDate: '2026-11-02' },
];
const EXPECTED_USAGE = [
  { odometer: 10000, date: '2026-11-01' },
  { odometer: 10500, date: '2026-11-02' },
];

function localFetch() {
  return vi.fn(async (url: any) => {
    const u = String(url);
    if (u.startsWith('/api/vehicles')) {
      return new Response(JSON.stringify({ success: true, data: [{ id: 'v-1', name: 'Corolla' }] }), { status: 200 });
    }
    if (u.startsWith('/api/schedules')) {
      return new Response(JSON.stringify({ success: true, data: SCHEDULES }), { status: 200 });
    }
    if (u.startsWith('/api/fuel')) {
      return new Response(JSON.stringify({ success: true, data: FUEL }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: false, error: 'unexpected ' + u }), { status: 500 });
  }) as unknown as typeof fetch;
}

describe('offline schedule alert sweep', () => {
  it('reads local vehicles + schedules and hands the evaluated rows (plus fuel-derived usage) to the shared notifier', async () => {
    const notify = vi.fn();
    const fetchImpl = localFetch();
    const alerter = createScheduleAlerter({ fetchImpl, notify, lang: () => 'ar', now: () => 1000 });

    const run = await alerter.runOnce();

    expect(notify).toHaveBeenCalledTimes(1);
    // Feature 1: the 4th argument is the vehicle's usage history, so the shared
    // notifier can project a km-only item's due day. The 5th is the odometer the
    // cadence policy compares against the last notified reading.
    expect(notify).toHaveBeenCalledWith(SCHEDULES.schedules, 'Corolla', 'ar', EXPECTED_USAGE, 10500);
    expect(run.vehicles).toBe(1);
    expect(run.schedules).toBe(3);
    expect(run.urgent).toEqual({ overdue: 1, due_soon: 1 });
    expect(run.error).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalledWith(expect.stringContaining('http'));
    expect(alerter.getLastRun()).toEqual(run);
  });

  it('still hands the notifier an empty usage list when fuel data is unavailable', async () => {
    const notify = vi.fn();
    const fetchImpl = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.startsWith('/api/vehicles')) return new Response(JSON.stringify({ success: true, data: [{ id: 'v-1', name: 'X' }] }), { status: 200 });
      if (u.startsWith('/api/schedules')) return new Response(JSON.stringify({ success: true, data: { vehicle: { name: 'X' }, schedules: [] } }), { status: 200 });
      return new Response(JSON.stringify({ success: false, error: 'no fuel' }), { status: 500 });
    }) as unknown as typeof fetch;

    await createScheduleAlerter({ fetchImpl, notify }).runOnce();
    expect(notify).toHaveBeenCalledWith([], 'X', expect.any(String), [], null);
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
