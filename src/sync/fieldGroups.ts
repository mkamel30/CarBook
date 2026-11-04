// Per-field-group last-write-wins.
//
// `maintenance_schedules` rows have two unrelated writers: the owner tuning an
// interval (config) and the log→item link advancing a service baseline (baseline).
// One row timestamp makes those two edits destroy each other — the newer push
// rewrites columns it never touched, so a phone that only recorded an oil change
// silently reverts a tablet's interval edit, and vice versa.
//
// Declaring the groups once here lets the server merge (`src/persistence/sync.ts`),
// the server REST writes (`src/persistence/repository.ts`) and the device writer
// (`mobile/src/device/writer.ts`) stamp and merge the identical rule. Nothing in
// this module touches a database, so both sides can test it directly.

/** One independently merged set of business columns. */
export interface FieldGroup {
  /** Stable identifier, used in reports and derived column names. */
  id: string;
  /** Business columns this group owns — server snake_case, the sync-contract keys. */
  columns: string[];
  /** Wire key carrying this group's timestamp in a push/pull row. */
  tsKey: string;
  /** Server column persisting that timestamp. */
  tsColumn: string;
  /** Device (WatermelonDB) bookkeeping column persisting that timestamp. */
  deviceTsColumn: string;
}

const SCHEDULE_GROUPS: FieldGroup[] = [
  {
    id: 'config',
    // The item's identity and cadence, plus its parent: a baseline-only edit
    // must never reparent or rename a row.
    columns: ['vehicle_id', 'item_code', 'title_ar', 'title_en', 'interval_km', 'interval_months'],
    tsKey: 'updatedAt',
    tsColumn: 'sync_ts',
    deviceTsColumn: 'updated_at_sync_config',
  },
  {
    id: 'baseline',
    columns: ['last_done_odometer', 'last_done_date'],
    tsKey: 'baselineUpdatedAt',
    tsColumn: 'baseline_ts',
    deviceTsColumn: 'updated_at_sync_baseline',
  },
];

export const GROUPED_TABLES: Record<string, FieldGroup[]> = {
  maintenance_schedules: SCHEDULE_GROUPS,
};

/** The groups of a table, or null when the table keeps plain row-level LWW. */
export function groupsOf(table: string): FieldGroup[] | null {
  return GROUPED_TABLES[table] ?? null;
}

export function isGroupedTable(table: string): boolean {
  return groupsOf(table) !== null;
}

/**
 * LWW timestamp columns a table keeps besides `sync_ts`.
 * Identifiers come from this module, never from a request, so they are safe to
 * interpolate into SQL.
 */
export function secondaryTsColumns(table: string): string[] {
  return (groupsOf(table) ?? []).map(g => g.tsColumn).filter(c => c !== 'sync_ts');
}

/** Every business column covered by `groups`, in group order, without repeats. */
export function columnsOfGroups(groups: FieldGroup[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    for (const c of g.columns) if (!seen.has(c)) { seen.add(c); out.push(c); }
  }
  return out;
}

/**
 * Groups a write touches, from the business columns it actually sets.
 * Empty for an ungrouped table, so callers can fall back to row-level stamping.
 */
export function touchedGroups(table: string, writtenColumns: Iterable<string>): FieldGroup[] {
  const groups = groupsOf(table);
  if (!groups) return [];
  const written = new Set(writtenColumns);
  return groups.filter(g => g.columns.some(c => written.has(c)));
}

/**
 * Timestamp the push carries for one group.
 *
 * A group the client does not stamp (an app built before it knew about groups,
 * or a partial row that only carries `updatedAt`) inherits the primary group's
 * stamp, which reproduces the old row-level behaviour exactly. That keeps the
 * upgrade additive: an old device cannot lose edits it would previously have made.
 */
export function incomingGroupTs(
  groups: FieldGroup[],
  row: Record<string, unknown>,
  group: FieldGroup,
): number | null {
  const own = Number(row[group.tsKey]);
  if (Number.isFinite(own)) return own;
  const primary = Number(row[groups[0].tsKey]);
  return Number.isFinite(primary) ? primary : null;
}

/**
 * Which groups a push may write: those whose stamp beats what the row holds.
 * `existingTs` maps server timestamp COLUMN -> stored value; null means the row
 * does not exist yet, so every group lands (a full-row insert).
 *
 * An empty result means the whole row is stale — the caller drops it silently,
 * the same way row-level LWW drops an old push (not an error).
 */
export function decideGroups(
  groups: FieldGroup[],
  incomingTs: Record<string, number>,
  existingTs: Record<string, number> | null,
): FieldGroup[] {
  return groups.filter((g) => {
    const incoming = incomingTs[g.id];
    if (!Number.isFinite(incoming)) return false;
    if (existingTs === null) return true;
    return Number(existingTs[g.tsColumn] ?? 0) < incoming;
  });
}

/**
 * The row's recency for row-level decisions (tombstones, deletes): the newest of
 * any group. Ungrouped tables and rows without group columns collapse to `sync_ts`.
 */
export function rowRecency(existingTsByColumn: Record<string, number>): number {
  let max = 0;
  for (const v of Object.values(existingTsByColumn)) {
    const n = Number(v ?? 0);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}
