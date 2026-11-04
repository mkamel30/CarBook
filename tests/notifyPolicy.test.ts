import { describe, it, expect } from 'vitest';
import {
  decideNotification,
  nextAlarmAt,
  WEEK_MS,
  ODOMETER_EVENT_MIN_GAP_MS,
} from '@/services/notifyPolicy';

// The cadence rule is the whole answer to "it nags me many times a day", so it is
// pinned here with an injected clock: one reminder per week, plus one extra look
// only when the odometer genuinely advanced.

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-06-01T09:00:00.000Z');

const mem = (lastNotifiedAt: number, odometer: number | null = 10000) => ({ lastNotifiedAt, odometer });

describe('notification cadence', () => {
  it('says nothing when no item is urgent', () => {
    expect(decideNotification({ urgent: false, memory: null, odometer: null, now: T0 }))
      .toMatchObject({ fire: false, reason: 'no_urgent' });
  });

  it('fires the first reminder immediately when the vehicle has never been notified', () => {
    expect(decideNotification({ urgent: true, memory: null, odometer: 10000, now: T0 }))
      .toEqual({ fire: true, reason: 'first' });
  });

  it('holds a repeated reminder to one per week', () => {
    for (const ago of [DAY, 3 * DAY, WEEK_MS - 1]) {
      const d = decideNotification({ urgent: true, memory: mem(T0 - ago), odometer: 10000, now: T0 });
      expect(d, `${ago / DAY} days after the last nudge`).toMatchObject({ fire: false, reason: 'throttled' });
      if (!d.fire) expect(d.nextAt).toBe(T0 - ago + WEEK_MS);
    }
    expect(decideNotification({ urgent: true, memory: mem(T0 - WEEK_MS), odometer: 10000, now: T0 }))
      .toEqual({ fire: true, reason: 'weekly' });
  });

  it('lets a newer odometer reading restart the reminder, but never faster than daily', () => {
    expect(decideNotification({ urgent: true, memory: mem(T0 - 2 * DAY), odometer: 10350, now: T0 }))
      .toEqual({ fire: true, reason: 'odometer' });

    const hoursAgo = 12 * 60 * 60 * 1000;
    expect(decideNotification({ urgent: true, memory: mem(T0 - hoursAgo), odometer: 10350, now: T0 }))
      .toMatchObject({ fire: false, reason: 'throttled' });
    expect(ODOMETER_EVENT_MIN_GAP_MS).toBe(DAY);
  });

  it('treats an equal or older reading as no event at all', () => {
    for (const odo of [10000, 9500]) {
      expect(decideNotification({ urgent: true, memory: mem(T0 - 2 * DAY), odometer: odo, now: T0 }))
        .toMatchObject({ fire: false, reason: 'throttled' });
    }
  });

  it('cannot invent an odometer event without a stored baseline reading', () => {
    expect(decideNotification({ urgent: true, memory: mem(T0 - 2 * DAY, null), odometer: 12000, now: T0 }))
      .toMatchObject({ fire: false, reason: 'throttled' });
  });

  it('ignores a corrupt stored timestamp instead of silencing reminders forever', () => {
    expect(decideNotification({ urgent: true, memory: mem(Number.NaN), odometer: 10000, now: T0 }))
      .toEqual({ fire: true, reason: 'first' });
  });
});

describe('closed-app alarm anchoring', () => {
  it('arms an overdue alarm a week out, not "an hour from this sweep"', () => {
    // The old rule recomputed `now + 1h` on every 30-minute sweep, which is an
    // hourly notification for as long as the app stays installed.
    expect(nextAlarmAt({ now: T0, memory: null, predictedDays: null })).toBe(T0 + WEEK_MS);
    const last = T0 - 3 * DAY;
    expect(nextAlarmAt({ now: T0, memory: mem(last), predictedDays: null })).toBe(last + WEEK_MS);
  });

  it('aims a due-soon alarm at its projected day, but never before the weekly floor', () => {
    const last = T0 - DAY;
    expect(nextAlarmAt({ now: T0, memory: mem(last), predictedDays: 2 })).toBe(last + WEEK_MS);
    expect(nextAlarmAt({ now: T0, memory: mem(last), predictedDays: 12 })).toBe(T0 + 12 * DAY);
  });

  it('rounds a sub-day projection up to a day', () => {
    expect(nextAlarmAt({ now: T0, memory: mem(T0 - 6 * DAY), predictedDays: 0.4 })).toBe(T0 + DAY);
  });
});
