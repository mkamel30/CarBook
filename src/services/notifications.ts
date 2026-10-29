/**
 * Device & Browser Notification Service for CarBook
 * Handles native notification permissions, scheduling, and urgent alert delivery.
 */

export interface NotificationStatus {
  supported: boolean;
  permission: 'granted' | 'denied' | 'default';
}

export function checkNotificationSupport(): NotificationStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { supported: false, permission: 'default' };
  }
  return {
    supported: true,
    permission: Notification.permission,
  };
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
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
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
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

/**
 * Checks vehicle schedules and triggers a notification if any item is overdue or due soon.
 * Avoids spamming by remembering last notified timestamp in localStorage.
 */
export function evaluateAndNotifySchedules(
  schedules: any[],
  vehicleName: string,
  lang: string = 'ar'
): void {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const urgentItems = schedules.filter(
    (s) => s.status === 'overdue' || s.status === 'due_soon'
  );

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
