/**
 * Reminder cadence — the one place that decides *whether* a maintenance
 * notification may fire. Pure and clock-injected so the rule is testable without
 * a browser, a device, or the Notification API.
 *
 * The owner's complaint this answers: an overdue item nagged many times a day.
 * The old rule was a flat 6-hour throttle, plus a closed-app alarm re-armed
 * "one hour from now" on every 30-minute sweep — which is an hourly alarm,
 * because each sweep moved its own trigger time forward.
 */

/** A reminder for the same unread state may not repeat faster than this. */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A newer odometer reading is the single event that earns an extra look inside
 * the week — and even then it stays a day apart, so one drive with three logs
 * entered cannot produce three toasts.
 */
export const ODOMETER_EVENT_MIN_GAP_MS = 24 * 60 * 60 * 1000;

export interface NotifyMemory {
  lastNotifiedAt: number;
  /** Vehicle odometer at that moment, or null when nothing reported one. */
  odometer: number | null;
}

export type NotifyDecision =
  | { fire: true; reason: 'first' | 'weekly' | 'odometer' }
  | { fire: false; reason: 'no_urgent' | 'throttled'; nextAt: number };

export function decideNotification(input: {
  urgent: boolean;
  memory: NotifyMemory | null;
  odometer: number | null;
  now: number;
}): NotifyDecision {
  if (!input.urgent) return { fire: false, reason: 'no_urgent', nextAt: input.now };

  const memory = input.memory;
  if (!memory || !Number.isFinite(memory.lastNotifiedAt)) {
    return { fire: true, reason: 'first' };
  }

  const since = input.now - memory.lastNotifiedAt;
  if (since >= WEEK_MS) return { fire: true, reason: 'weekly' };

  // Strictly greater: a re-entered or older reading is not an event.
  const odometerAdvanced =
    input.odometer !== null && memory.odometer !== null && input.odometer > memory.odometer;
  if (odometerAdvanced && since >= ODOMETER_EVENT_MIN_GAP_MS) {
    return { fire: true, reason: 'odometer' };
  }

  return { fire: false, reason: 'throttled', nextAt: memory.lastNotifiedAt + WEEK_MS };
}

/**
 * When the next closed-app alarm may fire for a still-urgent item. Anchored to
 * the last delivered reminder rather than to "now", because a relative delay is
 * recomputed on every sweep and silently becomes a repeating hourly alarm.
 */
export function nextAlarmAt(input: {
  now: number;
  memory: NotifyMemory | null;
  /** Days until the projected due date, when the item has one (Feature 1). */
  predictedDays: number | null;
}): number {
  const weeklyFloor = (input.memory?.lastNotifiedAt ?? input.now) + WEEK_MS;
  if (input.predictedDays === null || !Number.isFinite(input.predictedDays)) return weeklyFloor;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const predicted = input.now + Math.max(1, Math.round(input.predictedDays)) * DAY_MS;
  return Math.max(weeklyFloor, predicted);
}
