/**
 * Device & Browser Notification Service for CarBook
 * Handles native Android Capacitor notifications and fallback browser notifications.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

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
): Promise<number> {
  if (!isNativePlatform()) return 0;

  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const vehicleId = schedules[0]?.schedule?.vehicleId ?? vehicleName;

  const toSchedule = schedules
    .filter((s) => s.status === 'overdue' || s.status === 'due_soon')
    .slice(0, 8)
    .map((s, i) => {
      const overdue = s.status === 'overdue';
      // Overdue: nudge soon. Due soon: aim at the date itself.
      let at = now + HOUR;
      if (!overdue && Number.isFinite(s.remainingDays) && s.remainingDays > 0) {
        at = now + Math.max(1, Math.round(s.remainingDays)) * DAY;
      }
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
 * Checks vehicle schedules and triggers a notification if any item is overdue or due soon.
 * Avoids spamming by remembering last notified timestamp in localStorage.
 */
export function evaluateAndNotifySchedules(
  schedules: any[],
  vehicleName: string,
  lang: string = 'ar'
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
  // app is closed. No-op on web; runs independently of the 6h toast throttle.
  void scheduleFutureMaintenanceNotifications(urgentItems, vehicleName, lang);

  if (urgentItems.length === 0) return;

  // Rate limit: trigger at most once every 6 hours per car session
  const lastNotifKey = `carbook_last_notif_${vehicleName}`;
  const lastTime = Number(localStorage.getItem(lastNotifKey) || 0);
  const now = Date.now();
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  if (now - lastTime < SIX_HOURS) {
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

  localStorage.setItem(lastNotifKey, String(now));
}
