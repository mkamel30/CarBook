// THE SCHEDULES DOMAIN CORE — one place where the log→item and odometer rules
// are decided, so the server repository and the offline device bridge cannot
// drift apart.
//
// The *rules* themselves (forward-only baselines, which items a service type
// evidences, which presets are still missing, honest `linkedFromLog` markers)
// already live as pure functions in services/presets.ts and services/
// calculator.ts. What used to be duplicated was the orchestration around them:
// two hand-written loops that walked schedules + logs and picked candidates,
// two GET-time evaluations, two odometer recomputes. Each adapter now owns only
// its storage port — read rows in, apply the patches the core returns — and the
// decisions below are shared by both. See domain/schedulesConformance.ts, which
// runs one behaviour suite against the server routes and against the bridge.

import { evaluateMaintenanceStatus, type MaintenanceStatus } from '../services/calculator';
import {
  baselineMovesForward,
  bestLogForItem,
  scheduleLinkedFromLog,
  type LinkedFromLog,
} from '../services/presets';
import type { MaintenanceSchedule } from './schemas';

/** The schedule-row fields the linking and read rules read. */
export interface ScheduleLike {
  itemCode: string;
  lastDoneOdometer?: number | null;
  lastDoneDate?: string | null;
}

/** The maintenance-log fields the linking rule reads. */
export interface ServiceLogLike {
  odometer: number;
  serviceDate: string;
  serviceType: string;
}

export interface BaselineCandidate {
  odometer: number;
  serviceDate: string;
}

export interface LinkParams {
  /** Items this write may touch; empty (after dedupe) means "change nothing". */
  itemCodes: Array<string | null | undefined>;
  /** The log the owner just wrote, used only for the explicitly picked item. */
  sourceLog?: BaselineCandidate | null;
  /** The item the owner picked in the log modal, if any. */
  explicitItemCode?: string | null;
}

/** One baseline write the adapters must apply to the row they gave us. */
export interface SchedulePatch<T extends ScheduleLike> {
  schedule: T;
  lastDoneOdometer: number;
  lastDoneDate: string;
}

export function dedupeItemCodes(codes: Array<string | null | undefined>): string[] {
  return Array.from(new Set(codes.filter((c): c is string => !!c)));
}

/**
 * Which schedule rows a service write drives forward, and to what baseline.
 *
 * `itemCodes` scopes which items may change. For each row in scope the baseline
 * comes from the newest live log that evidences it — or, for the item the owner
 * picked explicitly, from that very log. Baselines only ever move FORWARD
 * (presets.baselineMovesForward), and an item whose supporting log is gone stays
 * untouched: deleting a log never invents, clears or rewinds a baseline.
 *
 * The caller supplies LIVE rows only; tombstoned logs/schedules must be filtered
 * by the storage port before this runs.
 */
export function planScheduleLinking<T extends ScheduleLike>(
  schedules: T[],
  logs: ServiceLogLike[],
  params: LinkParams,
): SchedulePatch<T>[] {
  const targets = dedupeItemCodes(params.itemCodes);
  if (targets.length === 0) return [];
  const explicit = params.explicitItemCode ?? null;

  const patches: SchedulePatch<T>[] = [];
  for (const schedule of schedules) {
    if (!targets.includes(schedule.itemCode)) continue;
    const explicitHit = !!explicit && schedule.itemCode === explicit;
    let candidate: BaselineCandidate | null = null;
    if (explicitHit && params.sourceLog) {
      candidate = { odometer: params.sourceLog.odometer, serviceDate: params.sourceLog.serviceDate };
    } else {
      const best = bestLogForItem(logs, schedule.itemCode);
      if (best) candidate = { odometer: best.odometer, serviceDate: best.serviceDate };
    }
    if (!candidate) continue;
    if (!baselineMovesForward(schedule, candidate)) continue;
    patches.push({
      schedule,
      lastDoneOdometer: candidate.odometer,
      lastDoneDate: candidate.serviceDate,
    });
  }
  return patches;
}

/** A schedule as a client sees it: computed status plus the service-record marker. */
export type EvaluatedSchedule = MaintenanceStatus & { linkedFromLog?: LinkedFromLog };

/**
 * The single schedule READ evaluation. `linkedFromLog` is added only when the
 * baseline is genuinely backed by a live log, so the key stays absent (exactly
 * as before this extraction) for hand-entered baselines.
 */
export function evaluateSchedulesForRead(
  schedules: readonly MaintenanceSchedule[],
  logs: Array<{ odometer: number; serviceDate: string }>,
  currentOdometer: number,
  currentDate: Date = new Date(),
): EvaluatedSchedule[] {
  return schedules.map((schedule) => {
    const status = evaluateMaintenanceStatus(schedule, currentOdometer, currentDate);
    const linkedFromLog = scheduleLinkedFromLog(schedule, logs);
    return linkedFromLog ? { ...status, linkedFromLog } : status;
  });
}

/**
 * The vehicle odometer rule: the highest reading the car has ever reported —
 * its initial odometer or any LIVE fuel/maintenance entry. libsql evaluates the
 * same expression inside the write transaction (repository's
 * RECALCULATE_ODOMETER_SQL) because the server must stay atomic; the device has
 * no such aggregate and computes it here. A non-numeric reading counts as 0, so
 * a corrupt value can never win the max.
 */
export function computeMaxOdometer(
  initialOdometer: unknown,
  readings: Iterable<unknown>,
): number {
  const asReading = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  let max = asReading(initialOdometer);
  for (const reading of readings) {
    const n = asReading(reading);
    if (n > max) max = n;
  }
  return max;
}
