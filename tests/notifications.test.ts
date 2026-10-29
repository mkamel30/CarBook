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

    const originalWindow = global.window;
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

    // Second call immediately within 6 hours should be throttled
    notifSpy.mockClear();
    evaluateAndNotifySchedules(mockSchedules, 'Corolla 2022', 'ar');
    expect(notifSpy).not.toHaveBeenCalled();

    // Clean up
    (global as any).window = originalWindow;
  });
});
