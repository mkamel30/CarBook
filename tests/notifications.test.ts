import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkNotificationSupport,
  sendLocalNotification,
  evaluateAndNotifySchedules,
} from '@/services/notifications';

describe('Notifications & Maintenance Alerts Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('gracefully handles environments without Notification support', () => {
    const status = checkNotificationSupport();
    // In node/vitest environment, window or Notification is simulated/undefined
    expect(status).toHaveProperty('supported');
    expect(status).toHaveProperty('permission');
  });

  it('correctly filters urgent schedules and prevents notification spam', () => {
    const mockSchedules = [
      { status: 'ok', remainingKm: 8000, schedule: { titleAr: 'زيت فتيس' } },
      { status: 'overdue', remainingKm: -500, schedule: { titleAr: 'زيت المحرك' } },
      { status: 'due_soon', remainingKm: 300, schedule: { titleAr: 'تيل الفرامل' } },
    ];

    // Simulate window and localStorage
    const storage: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (k: string) => storage[k] || null,
      setItem: (k: string, v: string) => { storage[k] = v; },
    };

    // Capture every global this test mutates so none of them leaks into later
    // suites (the mock localStorage/window/Notification used to persist).
    const originalWindow = (global as any).window;
    const originalLocalStorage = (global as any).localStorage;
    const originalNotification = (global as any).Notification;
    const restore = (key: 'window' | 'localStorage' | 'Notification', value: any) => {
      if (value === undefined) delete (global as any)[key];
      else (global as any)[key] = value;
    };

    try {
      (global as any).window = {
        Notification: {
          permission: 'granted',
          requestPermission: vi.fn().mockResolvedValue('granted'),
        },
      };
      (global as any).localStorage = mockLocalStorage;

      const notifSpy = vi.fn();
      (global as any).Notification = notifSpy;
      (global as any).Notification.permission = 'granted';

      evaluateAndNotifySchedules(mockSchedules, 'Corolla 2022', 'ar');

      expect(notifSpy).toHaveBeenCalled();
      const callArgs = notifSpy.mock.calls[0];
      expect(callArgs[0]).toContain('كـاربوك');
      expect(callArgs[1].body).toContain('متأخر');

      // Second call immediately within the week, same odometer: throttled.
      notifSpy.mockClear();
      evaluateAndNotifySchedules(mockSchedules, 'Corolla 2022', 'ar');
      expect(notifSpy).not.toHaveBeenCalled();
    } finally {
      // Clean up — window AND the other globals (localStorage, Notification).
      restore('window', originalWindow);
      restore('localStorage', originalLocalStorage);
      restore('Notification', originalNotification);
    }
  });
});

// The wiring, not just the rule: the evaluator must actually consult and rewrite
// the stored reminder memory. The clock is not injectable here, so the stored
// state is seeded directly — which is exactly what a device carries between runs.
describe('reminder cadence wiring through evaluateAndNotifySchedules', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const OVERDUE = [{ status: 'overdue', remainingKm: -500, schedule: { id: 's-1', titleAr: 'زيت' } }];
  const CAR = 'Cadence Corolla';
  let storage: Record<string, string>;
  let fired: any[][];
  let restore: () => void;

  beforeEach(() => {
    storage = {};
    fired = [];
    const originals = {
      window: (global as any).window,
      localStorage: (global as any).localStorage,
      Notification: (global as any).Notification,
    };
    (global as any).window = { Notification: { permission: 'granted' } };
    (global as any).localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v; },
    };
    (global as any).Notification = vi.fn((...args: any[]) => { fired.push(args); });
    (global as any).Notification.permission = 'granted';
    restore = () => {
      for (const [key, value] of Object.entries(originals)) {
        if (value === undefined) delete (global as any)[key];
        else (global as any)[key] = value;
      }
    };
  });

  const seed = (daysAgo: number, odometer: number | null) => {
    storage[`carbook_notif_state_${CAR}`] = JSON.stringify({
      lastNotifiedAt: Date.now() - daysAgo * DAY,
      odometer,
    });
  };
  const state = () => JSON.parse(storage[`carbook_notif_state_${CAR}`] || '{}');

  it('stays silent inside the week when the odometer has not moved', () => {
    seed(2, 10000);
    evaluateAndNotifySchedules(OVERDUE, CAR, 'ar', [], 10000);
    expect(fired).toHaveLength(0);
  });

  it('reminds again once a week has passed', () => {
    seed(8, 10000);
    evaluateAndNotifySchedules(OVERDUE, CAR, 'ar', [], 10000);
    expect(fired).toHaveLength(1);
    expect(state().odometer).toBe(10000);
  });

  it('reminds on a newer odometer reading, the moment the owner logs fuel or a service', () => {
    seed(2, 10000);
    evaluateAndNotifySchedules(OVERDUE, CAR, 'ar', [], 10400);
    expect(fired).toHaveLength(1);
    expect(state().odometer).toBe(10400);
  });

  it('honours the pre-cadence stored timestamp so an upgrade does not re-nag', () => {
    storage[`carbook_last_notif_${CAR}`] = String(Date.now() - 2 * DAY);
    evaluateAndNotifySchedules(OVERDUE, CAR, 'ar', [], 10400);
    expect(fired).toHaveLength(0);
  });
});
