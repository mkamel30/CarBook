/**
 * Device & Browser Notification Service for CarBook
 * Handles native Android Capacitor notifications and fallback browser notifications.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { alarmDelayDays, type UsagePoint } from './calculator';
import { decideNotification, nextAlarmAt, type NotifyMemory } from './notifyPolicy';

export interface NotificationStatus {
  supported: boolean;
  permission: 'granted' | 'denied' | 'default';
  isNative?: boolean;
}

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function checkNotificationSupportAsync(): Promise<NotificationStatus> {
  if (isNativePlatform()) {
    try {
      const res = await LocalNotifications.checkPermissions();
      const perm = res.display === 'granted' ? 'granted' : res.display === 'denied' ? 'denied' : 'default';
      return { supported: true, permission: perm, isNative: true };
    } catch {
      return { supported: true, permission: 'default', isNative: true };
    }
  }
  return checkNotificationSupport();
}

export function checkNotificationSupport(): NotificationStatus {
  if (typeof window === 'undefined') {
    return { supported: false, permission: 'default' };
  }
  if (isNativePlatform()) {
    return { supported: true, permission: 'default', isNative: true };
  }
  if (!('Notification' in window)) {
    return { supported: false, permission: 'default' };
  }
  return {
    supported: true,
    permission: Notification.permission,
    isNative: false,
  };
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (isNativePlatform()) {
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display === 'granted') {
        try {
          await LocalNotifications.createChannel({
            id: 'carbook_maintenance',
            name: 'CarBook Maintenance Alerts',
            description: 'Alerts for upcoming and overdue maintenance schedules',
            importance: 4,
            visibility: 1,
            vibration: true,
          });
        } catch {}
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error requesting native notification permission:', err);
      return false;
    }
  }

  if (!('Notification' in window)) {
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return false;
  }
}

export function sendLocalNotification(title: string, options?: NotificationOptions): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (isNativePlatform()) {
    try {
      const notifId = Math.floor(Math.random() * 1000000);
      LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title,
            body: options?.body || '',
            channelId: 'carbook_maintenance',
          },
        ],
      }).catch((err) => {
        console.error('Failed to trigger native notification:', err);
      });
      return true;
    } catch (err) {
      console.error('Failed to schedule native notification:', err);
      return false;
    }
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const notif = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [200, 100, 200],
      ...options,
    } as any);

    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    return true;
  } catch (err) {
    console.error('Failed to trigger notification:', err);
    return false;
  }
}

const MAINTENANCE_CHANNEL_ID = 'carbook_maintenance';
// Future-dated reminder ids live in a dedicated band so they never collide with
// the random ids used by the immediate toast (sendLocalNotification).
const FUTURE_NOTIF_BASE_ID = 40_000;

function stableNotificationId(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return FUTURE_NOTIF_BASE_ID + (Math.abs(h) % 10_000);
}

/**
 * Per-vehicle reminder memory. The pre-cadence key (`carbook_last_notif_…`) is
 * still read, so a device upgrading mid-week does not immediately re-nag.
 */
function readMemory(vehicleName: string): NotifyMemory | null {
  try {
    const raw = localStorage.getItem(`carbook_notif_state_${vehicleName}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      const last = Number(parsed?.lastNotifiedAt);
      if (Number.isFinite(last)) {
        const odo = Number(parsed?.odometer);
        return { lastNotifiedAt: last, odometer: Number.isFinite(odo) ? odo : null };
      }
    }
    const legacy = Number(localStorage.getItem(`carbook_last_notif_${vehicleName}`) || 0);
    return legacy > 0 ? { lastNotifiedAt: legacy, odometer: null } : null;
  } catch {
    return null;
  }
}

function writeMemory(vehicleName: string, memory: NotifyMemory): void {
  try {
    localStorage.setItem(`carbook_notif_state_${vehicleName}`, JSON.stringify(memory));
  } catch {
    // Reminder memory is best-effort: losing it costs one extra nudge, never a
    // missed schedule.
  }
}


/**
 * Schedules (or clears) future-dated native notifications for due/overdue
 * preventive items. `LocalNotifications.schedule({ at })` hands the alarm to the
 * OS, so these fire even while the app is closed — the missing piece for
 * closed-app delivery. Known limitation: OS alarms do not survive a device
 * reboot, so this is re-armed on every app open and periodic sweep
 * (evaluateAndNotifySchedules runs on vehicle load and every 30 min).
 *
 * Ids are stable per (vehicle, schedule), so re-scheduling REPLACES the same
 * alarm instead of stacking duplicates; ids that stop being urgent are cancelled
 * from the per-vehicle set tracked in localStorage.
 */
export async function scheduleFutureMaintenanceNotifications(
  schedules: any[],
  vehicleName: string,
  lang: string = 'ar',
  usage: UsagePoint[] = [],
): Promise<number> {
  if (!isNativePlatform()) return 0;

  const now = Date.now();
  const vehicleId = schedules[0]?.schedule?.vehicleId ?? vehicleName;
  const memory = readMemory(vehicleName);

  const toSchedule = schedules
    .filter((s) => s.status === 'overdue' || s.status === 'due_soon')
    .slice(0, 8)
    .map((s, i) => {
      const overdue = s.status === 'overdue';
      // Anchored to the last delivered reminder, not to this sweep: a relative
      // "in an hour" recomputed every 30 minutes is an hourly alarm, which is the
      // nagging the owner reported. A due-soon item still aims at its projected
      // day (date axis, or the Feature 1 usage projection for a km-only item),
      // but never before the weekly floor.
      const at = nextAlarmAt({ now, memory, predictedDays: alarmDelayDays(s, usage, now) });
      const itemTitle = lang === 'en' ? s.schedule?.titleEn : s.schedule?.titleAr;
      const key = `${vehicleId}:${s.schedule?.id ?? i}`;
      return {
        id: stableNotificationId(key),
        title: lang === 'en'
          ? `CarBook: ${overdue ? 'Overdue' : 'Due soon'} — ${vehicleName}`
          : `كاربوك: ${overdue ? 'متأخرة' : 'مستحقة قريباً'} — ${vehicleName}`,
        body: itemTitle || (lang === 'en' ? 'Maintenance reminder' : 'تذكير صيانة'),
        channelId: MAINTENANCE_CHANNEL_ID,
        schedule: { at: new Date(at), allowWhileIdle: true },
      };
    });

  const storeKey = `carbook_future_notifs_${vehicleId}`;
  let prevIds: number[] = [];
  try {
    prevIds = JSON.parse(localStorage.getItem(storeKey) || '[]');
  } catch {
    prevIds = [];
  }
  const newIds = toSchedule.map((n) => n.id);
  const stale = prevIds.filter((id) => !newIds.includes(id));

  try {
    if (stale.length) {
      await LocalNotifications.cancel({ notifications: stale.map((id) => ({ id })) });
    }
    if (toSchedule.length) {
      await LocalNotifications.schedule({ notifications: toSchedule });
    }
  } catch {
    return 0;
  }

  try {
    localStorage.setItem(storeKey, JSON.stringify(newIds));
  } catch {}
  return toSchedule.length;
}

/**
 * Checks vehicle schedules and triggers a notification if any item is overdue or
 * due soon, at the cadence `notifyPolicy` defines (weekly, or a newer odometer).
 */
export function evaluateAndNotifySchedules(
  schedules: any[],
  vehicleName: string,
  lang: string = 'ar',
  usage: UsagePoint[] = [],
  currentOdometer: number | null = null
): void {
  const isNative = isNativePlatform();
  if (typeof window === 'undefined') return;

  if (!isNative) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }
  }

  const urgentItems = schedules.filter(
    (s) => s.status === 'overdue' || s.status === 'due_soon'
  );

  // (Re)arm future-dated native notifications so reminders fire even while the
  // app is closed. No-op on web; runs independently of the in-app cadence below.
  // `usage` lets a km-only item's alarm be aimed at its projected due day (Feature 1).
  void scheduleFutureMaintenanceNotifications(urgentItems, vehicleName, lang, usage);

  if (urgentItems.length === 0) return;

  const now = Date.now();
  const odometer = Number.isFinite(currentOdometer as number) ? currentOdometer : null;

  // Cadence: one reminder per item-state per week, plus one extra look when the
  // odometer actually advanced (a new fuel or service log entered) — see
  // src/services/notifyPolicy.ts. This replaces the old flat 6-hour throttle,
  // which allowed four nags a day.
  const memory = readMemory(vehicleName);
  const decision = decideNotification({ urgent: true, memory, odometer, now });
  if (!decision.fire) {
    return;
  }

  const overdueCount = urgentItems.filter((s) => s.status === 'overdue').length;
  const dueSoonCount = urgentItems.filter((s) => s.status === 'due_soon').length;

  const title = lang === 'en'
    ? `🚗 CarBook: Maintenance Alert for ${vehicleName}`
    : `🚗 كـاربوك: تنبيه صيانة لـ ${vehicleName}`;

  let body = '';
  if (lang === 'en') {
    if (overdueCount > 0) {
      body = `You have ${overdueCount} overdue maintenance items needing immediate attention!`;
    } else {
      body = `You have ${dueSoonCount} maintenance items due soon.`;
    }
  } else {
    if (overdueCount > 0) {
      body = `لديك ${overdueCount} بند صيانة متأخر بحاجة للاهتمام الفوري!`;
    } else {
      body = `لديك ${dueSoonCount} بند صيانة مستحق قريباً.`;
    }
  }

  sendLocalNotification(title, {
    body,
    tag: `carbook_maintenance_${vehicleName}`,
  });

  writeMemory(vehicleName, {
    lastNotifiedAt: now,
    // Keep the last known reading when this caller has none, so an odometer
    // reported later still counts as advancing rather than starting from blank.
    odometer: odometer ?? memory?.odometer ?? null,
  });
}
