import { describe, it, expect } from 'vitest';
import {
  GROUPED_TABLES,
  columnsOfGroups,
  decideGroups,
  groupsOf,
  incomingGroupTs,
  isGroupedTable,
  rowRecency,
  secondaryTsColumns,
  touchedGroups,
} from './fieldGroups';

const SCHEDULE = 'maintenance_schedules';
const groups = () => groupsOf(SCHEDULE)!;
const config = groups()[0];
const baseline = groups()[1];

describe('field groups: declaration', () => {
  it('groups every schedule column exactly once', () => {
    expect(columnsOfGroups(groups())).toEqual([
      'vehicle_id', 'item_code', 'title_ar', 'title_en', 'interval_km', 'interval_months',
      'last_done_odometer', 'last_done_date',
    ]);
  });

  it('leaves every other table on plain row-level last-write-wins', () => {
    for (const table of ['vehicles', 'maintenance_logs', 'fuel_logs', 'users']) {
      expect(isGroupedTable(table)).toBe(false);
      expect(groupsOf(table)).toBeNull();
      expect(secondaryTsColumns(table)).toEqual([]);
      expect(touchedGroups(table, ['odometer', 'notes'])).toEqual([]);
    }
  });

  it('needs a second clock only where a group owns one', () => {
    // config rides the existing sync_ts, baseline is the added column.
    expect(secondaryTsColumns(SCHEDULE)).toEqual(['baseline_ts']);
    expect(config.tsColumn).toBe('sync_ts');
    expect(baseline.tsColumn).toBe('baseline_ts');
    expect(GROUPED_TABLES[SCHEDULE]).toHaveLength(2);
  });
});

describe('field groups: which groups a write touches', () => {
  it('sees an interval edit as config only', () => {
    expect(touchedGroups(SCHEDULE, ['interval_km']).map(g => g.id)).toEqual(['config']);
  });

  it('sees a service-baseline advance as baseline only', () => {
    expect(touchedGroups(SCHEDULE, ['last_done_odometer', 'last_done_date']).map(g => g.id)).toEqual(['baseline']);
  });

  it('sees a write that sets both as both, in declaration order', () => {
    const ids = touchedGroups(SCHEDULE, ['last_done_date', 'title_ar']).map(g => g.id);
    expect(ids).toEqual(['config', 'baseline']);
  });

  it('touches nothing when the write carries no schedule column', () => {
    expect(touchedGroups(SCHEDULE, ['odometer'])).toEqual([]);
    expect(touchedGroups(SCHEDULE, [])).toEqual([]);
  });
});

describe('field groups: the stamp a push carries', () => {
  it('uses the group’s own wire key when the client sends one', () => {
    const row = { updatedAt: 1000, baselineUpdatedAt: 2500 };
    expect(incomingGroupTs(groups(), row, config)).toBe(1000);
    expect(incomingGroupTs(groups(), row, baseline)).toBe(2500);
  });

  it('inherits the row stamp for a client that knows nothing about groups', () => {
    // This fallback is what makes the change additive: an old app still argues
    // with exactly the timestamp it argued with before, for both groups.
    const row = { updatedAt: 700 };
    expect(incomingGroupTs(groups(), row, baseline)).toBe(700);
  });

  it('accepts a numeric string the way the row-level path always has', () => {
    expect(incomingGroupTs(groups(), { updatedAt: '900' }, config)).toBe(900);
  });

  it('has no stamp at all when neither the group nor the row carries one', () => {
    expect(incomingGroupTs(groups(), {}, config)).toBeNull();
    expect(incomingGroupTs(groups(), {}, baseline)).toBeNull();
  });

  it('reads a group-only stamp without inventing one for the other group', () => {
    // The server falls back to the clock only where the helper returns null.
    const row = { baselineUpdatedAt: 5 };
    expect(incomingGroupTs(groups(), row, baseline)).toBe(5);
    expect(incomingGroupTs(groups(), row, config)).toBeNull();
  });
});

describe('field groups: the server merge decision', () => {
  const incoming = { config: 2000, baseline: 2000 };

  it('accepts every group of a row that does not exist yet', () => {
    expect(decideGroups(groups(), incoming, null).map(g => g.id)).toEqual(['config', 'baseline']);
  });

  it('accepts only the group that is genuinely newer', () => {
    const stored = { sync_ts: 1500, baseline_ts: 3000 };
    expect(decideGroups(groups(), { config: 2000, baseline: 2000 }, stored).map(g => g.id)).toEqual(['config']);
    expect(decideGroups(groups(), { config: 1000, baseline: 3500 }, stored).map(g => g.id)).toEqual(['baseline']);
  });

  it('treats an equal stamp as already applied and accepts nothing', () => {
    const stored = { sync_ts: 2000, baseline_ts: 2000 };
    expect(decideGroups(groups(), incoming, stored)).toEqual([]);
  });

  it('drops a group whose stamp is unusable rather than writing it blind', () => {
    const stored = { sync_ts: 10, baseline_ts: 10 };
    expect(decideGroups(groups(), { config: Number.NaN, baseline: 20 }, stored).map(g => g.id)).toEqual(['baseline']);
  });

  it('judges a missing stored stamp as zero, so an old row is still updatable', () => {
    expect(decideGroups(groups(), incoming, { sync_ts: 0, baseline_ts: 0 }).map(g => g.id)).toEqual(['config', 'baseline']);
  });
});

describe('field groups: row recency for deletes', () => {
  it('is the newest of any group', () => {
    expect(rowRecency({ sync_ts: 1000, baseline_ts: 2500 })).toBe(2500);
    expect(rowRecency({ sync_ts: 4000, baseline_ts: 2500 })).toBe(4000);
  });

  it('collapses to sync_ts for an ungrouped table, keeping delete behaviour identical', () => {
    expect(rowRecency({ sync_ts: 1234 })).toBe(1234);
    expect(rowRecency({ sync_ts: 0 })).toBe(0);
  });

  it('ignores junk instead of letting it outrank a real stamp', () => {
    expect(rowRecency({ sync_ts: Number.NaN, baseline_ts: 50 })).toBe(50);
  });
});
