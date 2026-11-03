// THE FETCH SEAM — patch window.fetch so the shared web UI runs fully offline.
//
// page.tsx and its components talk to the server only through ~30
// `fetch('/api/...')` call sites. Here every `/api/...` request that the device
// can serve is answered locally from WatermelonDB with the SAME JSON envelope
// and status code the corresponding src/app/api/** route returns. Two families
// are forwarded to the real server because they genuinely need network:
//   /api/auth/*  — Google login / device session
//   /api/ai/*    — Gemini/OpenRouter manual + doctor lookups
// Both fail LOUDLY offline: with no connectivity the bridge short-circuits them
// into a structured 503 {error, code:'NETWORK_REQUIRED'} instead of letting a
// transport exception escape, and a transport error is converted to the same
// envelope. /api/backup and /api/settings/fuel-prices are served locally — the
// backup document is byte-compatible with the server's, restore semantics mirror
// src/services/backup.ts, and fuel prices come from the same geoPricing presets
// the server route uses. Anything else under /api has no offline handler and
// returns a structured 501 (never a silent empty body), so an unfinished
// endpoint fails loudly.

import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import { localCreate, localUpdate, localMarkDeleted } from '@device/writer';
import {
  vehicleFromRaw,
  fuelFromRaw,
  maintenanceFromRaw,
  scheduleFromRaw,
  vehicleFields,
  fuelFields,
  maintenanceFields,
  schedulePatchFields,
  scheduleCreateFields,
  scheduleSeedFields,
  type Raw,
} from './mappers';
import { ok, okMessage, fail, notImplemented } from './envelope';
import { settingsResponseData, type SettingsStore } from './settingsStore';
import { SERVER_BASE_URL } from './config';
import {
  RESTORE_MODES,
  applyBackupDocument,
  backupByteSize,
  buildBackupDocument,
  parseBackupDocument,
  MAX_RESTORE_BYTES,
  BackupTooLargeError,
} from './localBackup';
import {
  detectCountryFromTimezone,
  getFuelPresetsByCountry,
  listSupportedCountries,
} from '@app/services/geoPricing';

// Pure, runtime-agnostic helpers aliased straight from the shared web code so
// aggregation can never drift from the server implementation.
import { enrichFuelMetrics, evaluateMaintenanceStatus } from '@app/services/calculator';
import {
  CUSTOM_ITEM_CODE_PREFIX,
  baselineMovesForward,
  bestLogForItem,
  derivedItemsForServiceType,
  missingFactoryPresets,
  scheduleLinkedFromLog,
  type LinkedFromLog,
} from '@app/services/presets';
import { DEFAULT_MAINTENANCE_PRESETS } from '@app/services/presets';
import {
  vehicleSchema,
  fuelLogSchema,
  maintenanceLogSchema,
  maintenanceScheduleSchema,
} from '@app/domain/schemas';

export interface BridgeDeps {
  db: Database;
  settings: SettingsStore;
  /** Passthrough origin for auth/AI; falls back to same-origin when empty. */
  serverBaseUrl?: string;
  /** The original fetch captured before patching, so passthrough cannot recurse. */
  passthroughFetch?: typeof fetch;
  now?: () => Date;
  /**
   * Connectivity probe for the auth/AI passthrough. Defaults to navigator.onLine
   * (true when the API is missing, e.g. under Node). When it reports offline the
   * bridge answers with a structured 503 instead of a rejected network call, so
   * the shared UI shows an error rather than hanging.
   */
  isOnline?: () => boolean;
}

export type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const VEHICLE_TABLE = 'vehicles';
const FUEL_TABLE = 'fuel_logs';
const MAINT_TABLE = 'maintenance_logs';
const SCHED_TABLE = 'maintenance_schedules';

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<any> {
  const raw = typeof init?.body === 'string' ? init.body : undefined;
  if (raw !== undefined) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      return await input.clone().json();
    } catch {
      return {};
    }
  }
  return {};
}

function splitUrl(url: string): { remote: boolean; pathname: string; search: URLSearchParams } {
  const isAbsolute = /^https?:\/\//i.test(url);
  const u = new URL(url, 'http://carbook.offline');
  return { remote: isAbsolute, pathname: u.pathname, search: u.searchParams };
}

/** navigator.onLine, defaulting to "reachable" where the API is absent (Node). */
function defaultOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') return navigator.onLine;
  return true;
}

interface Row {
  id: string;
  raw: Raw;
}

async function liveRows(db: Database, table: string, vehicleId?: string): Promise<Row[]> {
  const c = db.collections.get(table as any);
  const recs = vehicleId
    ? await c.query(Q.where('vehicle_id', vehicleId)).fetch()
    : await c.query().fetch();
  return (recs as any[])
    .filter((r) => (r._raw?._dirty ?? '') !== 'deleted')
    .map((r) => ({ id: String(r.id), raw: r._raw || {} }));
}

async function findVehicle(db: Database, id: string): Promise<Raw | null> {
  try {
    const rec: any = await db.collections.get(VEHICLE_TABLE as any).find(id);
    if ((rec?._raw?._dirty ?? '') === 'deleted') return null;
    return rec._raw || null;
  } catch {
    return null;
  }
}

async function readVehicle(db: Database, id: string): Promise<any | null> {
  const raw = await findVehicle(db, id);
  return raw ? vehicleFromRaw(id, raw) : null;
}

/**
 * Mirror the server's atomic odometer rule: after any fuel/maintenance change the
 * vehicle's current odometer is the max of its initial odometer and every live
 * fuel/maintenance entry. Written back through the dirty-marking writer.
 */
async function recomputeVehicleOdometer(db: Database, vehicleId: string, now: number): Promise<void> {
  const raw = await findVehicle(db, vehicleId);
  if (!raw) return;
  const fuel = await liveRows(db, FUEL_TABLE, vehicleId);
  const maint = await liveRows(db, MAINT_TABLE, vehicleId);
  let max = Number(raw.initial_odometer) || 0;
  for (const r of fuel) max = Math.max(max, Number(r.raw.odometer) || 0);
  for (const r of maint) max = Math.max(max, Number(r.raw.odometer) || 0);
  if (max !== (Number(raw.current_odometer) || 0)) {
    await localUpdate(db, VEHICLE_TABLE, vehicleId, { current_odometer: max }, now);
  }
}

function zodFail(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  return fail(message, 400);
}

async function handleVehicles(
  db: Database, method: string, params: URLSearchParams, body: any, nowIso: string, at: number,
): Promise<Response> {
  if (method === 'GET') {
    const rows = await liveRows(db, VEHICLE_TABLE);
    const vehicles = rows
      .map((r) => vehicleFromRaw(r.id, r.raw))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return ok(vehicles);
  }

  if (method === 'POST') {
    const id = newId();
    let validated: any;
    try {
      validated = vehicleSchema.parse({
        ...body, id, userId: null, createdAt: body.createdAt ?? nowIso, updatedAt: nowIso,
      });
    } catch (err) {
      return zodFail(err);
    }
    await localCreate(db, VEHICLE_TABLE, id, vehicleFields(validated, 'create', nowIso), at);
    return ok(await readVehicle(db, id));
  }

  if (method === 'PUT') {
    const id = body?.id;
    if (!id) return fail('Vehicle id is required', 400);
    const existing = await readVehicle(db, id);
    if (!existing) return fail('Vehicle not found or unauthorized', 400);
    let merged: any;
    try {
      merged = vehicleSchema.parse({ ...existing, ...body, userId: null });
    } catch (err) {
      return zodFail(err);
    }
    await localUpdate(db, VEHICLE_TABLE, id, vehicleFields(merged, 'update', nowIso), at);
    return ok(await readVehicle(db, id));
  }

  if (method === 'DELETE') {
    const id = params.get('id');
    if (!id) return fail('Vehicle id is required', 400);
    const existing = await readVehicle(db, id);
    if (!existing) return fail('Vehicle not found or unauthorized', 400);
    // Cascade the tombstone to children, like the server's deleteVehicle.
    for (const table of [FUEL_TABLE, MAINT_TABLE, SCHED_TABLE]) {
      const children = await liveRows(db, table, id);
      for (const child of children) await localMarkDeleted(db, table, child.id, at);
    }
    await localMarkDeleted(db, VEHICLE_TABLE, id, at);
    return okMessage('Vehicle deleted successfully');
  }

  return notImplemented(`GET|POST|PUT|DELETE /api/vehicles (${method})`);
}

async function handleFuel(
  db: Database, method: string, params: URLSearchParams, body: any, nowIso: string, at: number,
): Promise<Response> {
  if (method === 'GET') {
    const vehicleId = params.get('vehicleId');
    if (!vehicleId) return fail('vehicleId is required', 400);
    if (!(await findVehicle(db, vehicleId))) return fail('Vehicle not found or unauthorized', 404);
    const rows = await liveRows(db, FUEL_TABLE, vehicleId);
    const logs = rows.map((r) => fuelFromRaw(r.id, r.raw)).sort((a, b) => b.odometer - a.odometer);
    return ok(enrichFuelMetrics(logs as any));
  }

  if (method === 'POST') {
    if (!(await findVehicle(db, body?.vehicleId))) return fail('Vehicle not found or unauthorized', 400);
    const id = newId();
    let validated: any;
    try {
      validated = fuelLogSchema.parse({ ...body, id, createdAt: body.createdAt ?? nowIso });
    } catch (err) {
      return zodFail(err);
    }
    await localCreate(db, FUEL_TABLE, id, fuelFields(validated, 'create', nowIso), at);
    await recomputeVehicleOdometer(db, validated.vehicleId, at);
    const rec: any = await db.collections.get(FUEL_TABLE as any).find(id);
    return ok(fuelFromRaw(id, rec._raw));
  }

  if (method === 'PUT') {
    const id = body?.id;
    if (!id) return fail('id is required', 400);
    let existingRaw: Raw;
    try {
      existingRaw = (await db.collections.get(FUEL_TABLE as any).find(id) as any)._raw;
    } catch {
      return fail(`Fuel log ${id} not found`, 400);
    }
    const existing = fuelFromRaw(id, existingRaw);
    let merged: any;
    try {
      merged = fuelLogSchema.parse({ ...existing, ...body, createdAt: existing.createdAt });
    } catch (err) {
      return zodFail(err);
    }
    await localUpdate(db, FUEL_TABLE, id, fuelFields(merged, 'update', nowIso), at);
    await recomputeVehicleOdometer(db, merged.vehicleId, at);
    const rec: any = await db.collections.get(FUEL_TABLE as any).find(id);
    return ok(fuelFromRaw(id, rec._raw));
  }

  if (method === 'DELETE') {
    const id = params.get('id');
    if (!id) return fail('id is required', 400);
    let rec: any;
    try {
      rec = await db.collections.get(FUEL_TABLE as any).find(id);
    } catch {
      return okMessage('Deleted successfully');
    }
    const vehicleId = rec._raw?.vehicle_id;
    await localMarkDeleted(db, FUEL_TABLE, id, at);
    if (vehicleId) await recomputeVehicleOdometer(db, vehicleId, at);
    return okMessage('Deleted successfully');
  }

  return notImplemented(`GET|POST|PUT|DELETE /api/fuel (${method})`);
}

async function handleMaintenance(
  db: Database, method: string, params: URLSearchParams, body: any, nowIso: string, at: number,
): Promise<Response> {
  if (method === 'GET') {
    const vehicleId = params.get('vehicleId');
    if (!vehicleId) return fail('vehicleId is required', 400);
    if (!(await findVehicle(db, vehicleId))) return fail('Vehicle not found or unauthorized', 404);
    const rows = await liveRows(db, MAINT_TABLE, vehicleId);
    const logs = rows.map((r) => maintenanceFromRaw(r.id, r.raw)).sort((a, b) => b.odometer - a.odometer);
    return ok(logs);
  }

  if (method === 'POST') {
    if (!(await findVehicle(db, body?.vehicleId))) return fail('Vehicle not found or unauthorized', 400);
    const id = newId();
    let validated: any;
    try {
      validated = maintenanceLogSchema.parse({ ...body, id, createdAt: body.createdAt ?? nowIso });
    } catch (err) {
      return zodFail(err);
    }
    await localCreate(db, MAINT_TABLE, id, maintenanceFields(validated, 'create', nowIso), at);
    await recomputeVehicleOdometer(db, validated.vehicleId, at);
    const explicit = body?.linkedItemCode ? String(body.linkedItemCode).trim() : null;
    const itemCodes = explicit ? [explicit] : derivedItemsForServiceType(validated.serviceType);
    const linked = await linkSchedulesInBridge(db, validated.vehicleId, itemCodes, validated, explicit, at);
    const rec: any = await db.collections.get(MAINT_TABLE as any).find(id);
    return ok({ ...maintenanceFromRaw(id, rec._raw), linkedSchedules: linked });
  }

  if (method === 'PUT') {
    const id = body?.id;
    if (!id) return fail('id is required', 400);
    let existingRaw: Raw;
    try {
      existingRaw = (await db.collections.get(MAINT_TABLE as any).find(id) as any)._raw;
    } catch {
      return fail(`Maintenance log ${id} not found`, 400);
    }
    const existing = maintenanceFromRaw(id, existingRaw);
    let merged: any;
    try {
      merged = maintenanceLogSchema.parse({ ...existing, ...body, createdAt: existing.createdAt });
    } catch (err) {
      return zodFail(err);
    }
    await localUpdate(db, MAINT_TABLE, id, maintenanceFields(merged, 'update', nowIso), at);
    await recomputeVehicleOdometer(db, merged.vehicleId, at);
    const explicit = body?.linkedItemCode ? String(body.linkedItemCode).trim() : null;
    const itemCodes = Array.from(new Set([
      ...derivedItemsForServiceType(existing?.serviceType),
      ...derivedItemsForServiceType(merged.serviceType),
      explicit,
    ].filter(Boolean) as string[]));
    const linked = await linkSchedulesInBridge(db, merged.vehicleId, itemCodes, merged, explicit, at);
    const rec: any = await db.collections.get(MAINT_TABLE as any).find(id);
    return ok({ ...maintenanceFromRaw(id, rec._raw), linkedSchedules: linked });
  }

  if (method === 'DELETE') {
    const id = params.get('id');
    if (!id) return fail('id is required', 400);
    let rec: any;
    try {
      rec = await db.collections.get(MAINT_TABLE as any).find(id);
    } catch {
      return okMessage('Deleted successfully');
    }
    const vehicleId = rec._raw?.vehicle_id;
    const serviceType = rec._raw?.service_type;
    await localMarkDeleted(db, MAINT_TABLE, id, at);
    if (vehicleId) {
      await recomputeVehicleOdometer(db, vehicleId, at);
      await linkSchedulesInBridge(db, vehicleId, derivedItemsForServiceType(serviceType), null, null, at);
    }
    return okMessage('Deleted successfully');
  }

  return notImplemented(`GET|POST|PUT|DELETE /api/maintenance (${method})`);
}

async function linkSchedulesInBridge(
  db: Database,
  vehicleId: string,
  itemCodes: string[],
  sourceLog: { odometer: number; serviceDate: string } | null,
  explicitItemCode: string | null,
  at: number,
): Promise<number> {
  const targets = Array.from(new Set(itemCodes.filter(Boolean)));
  if (!targets.length) return 0;
  const schedRows = await liveRows(db, SCHED_TABLE, vehicleId);
  const logRows = await liveRows(db, MAINT_TABLE, vehicleId);
  const logs = logRows.map((r) => maintenanceFromRaw(r.id, r.raw));
  let updatedCount = 0;
  for (const row of schedRows) {
    const sched = scheduleFromRaw(row.id, row.raw);
    if (!targets.includes(sched.itemCode)) continue;
    const explicitHit = !!explicitItemCode && sched.itemCode === explicitItemCode;
    let candidate: { odometer: number; serviceDate: string } | null = null;
    if (explicitHit && sourceLog) {
      candidate = { odometer: sourceLog.odometer, serviceDate: sourceLog.serviceDate };
    } else {
      const best = bestLogForItem(logs, sched.itemCode);
      if (best) candidate = { odometer: best.odometer, serviceDate: best.serviceDate };
    }
    if (!candidate) continue;
    if (!baselineMovesForward(sched as any, candidate)) continue;
    await localUpdate(db, SCHED_TABLE, row.id, {
      last_done_odometer: candidate.odometer,
      last_done_date: candidate.serviceDate,
    }, at);
    updatedCount++;
  }
  return updatedCount;
}

async function seedSchedules(db: Database, vehicleId: string, at: number): Promise<void> {
  const existingRows = await liveRows(db, SCHED_TABLE, vehicleId);
  const existingCodes = existingRows.map((r) => String(r.raw.item_code));
  const missing = missingFactoryPresets(existingCodes);
  for (const preset of missing) {
    await localCreate(db, SCHED_TABLE, newId(), scheduleSeedFields(preset, vehicleId), at);
  }
}

async function handleSchedules(
  db: Database, method: string, params: URLSearchParams, body: any, at: number,
): Promise<Response> {
  if (method === 'GET') {
    const vehicleId = params.get('vehicleId');
    if (!vehicleId) return fail('vehicleId is required', 400);
    const vehicleRaw = await findVehicle(db, vehicleId);
    if (!vehicleRaw) return fail('Vehicle not found or unauthorized', 404);
    const vehicle = vehicleFromRaw(vehicleId, vehicleRaw);

    await seedSchedules(db, vehicleId, at);
    const rows = await liveRows(db, SCHED_TABLE, vehicleId);
    const logRows = await liveRows(db, MAINT_TABLE, vehicleId);
    const logs = logRows.map((r) => maintenanceFromRaw(r.id, r.raw));
    const schedules = rows.map((r) => scheduleFromRaw(r.id, r.raw));
    const evaluated = schedules.map((s) => {
      const status = evaluateMaintenanceStatus(s as any, vehicle.currentOdometer);
      const linkedFromLog = scheduleLinkedFromLog(s as any, logs);
      return linkedFromLog ? { ...status, linkedFromLog } : status;
    });
    return ok({ vehicle, schedules: evaluated });
  }

  if (method === 'POST') {
    const vehicleId = String(body?.vehicleId ?? '');
    const vehicleRaw = await findVehicle(db, vehicleId);
    if (!vehicleRaw) return fail('Vehicle not found or unauthorized', 404);
    const titleAr = typeof body?.titleAr === 'string' ? body.titleAr.trim() : '';
    const titleEn = typeof body?.titleEn === 'string' && body.titleEn.trim() ? body.titleEn.trim() : titleAr;
    const intervalKm = Number(body?.intervalKm);
    const intervalMonths = body?.intervalMonths ? Number(body.intervalMonths) : null;
    const itemCode = `${CUSTOM_ITEM_CODE_PREFIX}${newId().replace(/-/g, '').slice(0, 12)}`;
    const parsed = maintenanceScheduleSchema.safeParse({
      id: newId(),
      vehicleId,
      itemCode,
      titleAr,
      titleEn,
      intervalKm,
      intervalMonths,
      lastDoneOdometer: null,
      lastDoneDate: null,
    });
    if (!parsed.success) return zodFail(parsed.error);
    await localCreate(db, SCHED_TABLE, parsed.data.id, scheduleCreateFields(parsed.data, vehicleId), at);
    return ok(parsed.data);
  }

  if (method === 'DELETE') {
    const id = params.get('id');
    if (!id) return fail('id is required', 400);
    await localMarkDeleted(db, SCHED_TABLE, id, at);
    return okMessage('Deleted successfully');
  }

  if (method === 'PATCH') {
    const id = body?.id;
    if (!id) return fail('id is required', 400);
    try {
      await db.collections.get(SCHED_TABLE as any).find(id);
    } catch {
      return fail(`Schedule ${id} not found`, 400);
    }
    await localUpdate(db, SCHED_TABLE, id, schedulePatchFields(body), at);
    return ok(undefined);
  }

  return notImplemented(`GET|POST|PATCH|DELETE /api/schedules (${method})`);
}

async function handleReports(db: Database, params: URLSearchParams): Promise<Response> {
  const vehicleId = params.get('vehicleId');
  if (!vehicleId) return fail('vehicleId is required', 400);
  const vehicleRaw = await findVehicle(db, vehicleId);
  if (!vehicleRaw) return fail('Vehicle not found or unauthorized', 404);
  const vehicle = vehicleFromRaw(vehicleId, vehicleRaw);

  const fuelRows = await liveRows(db, FUEL_TABLE, vehicleId);
  const maintRows = await liveRows(db, MAINT_TABLE, vehicleId);
  const schedRows = await liveRows(db, SCHED_TABLE, vehicleId);

  const fuelLogs = fuelRows.map((r) => fuelFromRaw(r.id, r.raw));
  const maintenanceLogs = maintRows.map((r) => maintenanceFromRaw(r.id, r.raw));
  const schedules = schedRows.map((r) => scheduleFromRaw(r.id, r.raw));

  const evaluatedSchedules = schedules.map((s) => evaluateMaintenanceStatus(s as any, vehicle.currentOdometer));

  const totalFuelCost = fuelLogs.reduce((sum, f) => sum + f.totalCost, 0);
  const totalFuelLiters = fuelLogs.reduce((sum, f) => sum + f.liters, 0);
  const totalMaintenanceCost = maintenanceLogs.reduce((sum, m) => sum + m.totalCost, 0);
  const totalExpenses = totalFuelCost + totalMaintenanceCost;

  const enrichedFuelLogs = enrichFuelMetrics(fuelLogs as any);
  const consumptionStats = enrichedFuelLogs.filter((f: any) => f.litersPer100Km !== null);
  const averageLitersPer100Km = consumptionStats.length > 0
    ? Number((consumptionStats.reduce((acc: number, c: any) => acc + c.litersPer100Km, 0) / consumptionStats.length).toFixed(2))
    : null;

  return ok({
    vehicle,
    summary: {
      totalFuelCost,
      totalFuelLiters,
      totalMaintenanceCost,
      totalExpenses,
      averageLitersPer100Km,
      fuelLogsCount: fuelLogs.length,
      maintenanceLogsCount: maintenanceLogs.length,
    },
    fuelLogs,
    maintenanceLogs,
    schedules: evaluatedSchedules,
  });
}

/**
 * GET /api/backup — the server's route returns the RAW document (not the usual
 * {success,data} envelope) with a Content-Disposition attachment header, because
 * SettingsTab downloads `res.blob()` straight away. Reproduced exactly.
 */
async function handleBackupExport(db: Database, nowIso: string): Promise<Response> {
  const doc = await buildBackupDocument(db, () => new Date(nowIso));
  const stamp = doc.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(doc, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="carbook-backup-${stamp}.json"`,
      'X-CarBook-Backup-Bytes': String(backupByteSize(doc)),
    },
  });
}

/** POST /api/backup — same body {file, mode}, same report, same error strings. */
async function handleBackupRestore(db: Database, body: any, at: number): Promise<Response> {
  const mode = body?.mode ?? 'merge';
  if (!RESTORE_MODES.includes(mode)) {
    return fail(`mode must be one of ${RESTORE_MODES.join(', ')}`, 400);
  }
  const bytes = backupByteSize(body?.file);
  if (bytes > MAX_RESTORE_BYTES) {
    // Refuse BEFORE touching the database: a restored account bigger than the
    // snapshot budget could never be persisted, so it must fail loudly instead.
    return fail(new BackupTooLargeError(bytes).message, 413, 'BACKUP_TOO_LARGE');
  }
  try {
    const report = await applyBackupDocument(db, parseBackupDocument(body?.file), mode, at);
    return ok(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(message, 400);
  }
}

/**
 * GET /api/settings/fuel-prices — the server's route is a thin wrapper over the
 * bundled geoPricing presets, so the device answers it from the very same module
 * (same `current` + `supportedCountries` payload) instead of failing offline.
 */
function handleFuelPrices(params: URLSearchParams): Response {
  const country = params.get('country');
  const tz = params.get('tz');
  let resolved = country;
  if (!resolved && tz) resolved = detectCountryFromTimezone(tz);
  if (!resolved) resolved = 'EG';
  return ok({ current: getFuelPresetsByCountry(resolved), supportedCountries: listSupportedCountries() });
}

function handleSettings(store: SettingsStore, method: string, body: any): Response {
  if (method === 'GET') {
    return ok(settingsResponseData(store.load()));
  }
  if (method === 'POST') {
    const patch: Record<string, any> = {};
    if (body?.provider) patch.provider = body.provider;
    if (body && body.apiKey !== undefined) patch.apiKey = body.apiKey || null;
    if (body && body.fuelTypes !== undefined) patch.fuelTypes = body.fuelTypes;
    store.save(patch);
    return okMessage('Settings saved successfully');
  }
  return notImplemented(`GET|POST /api/settings (${method})`);
}

export function createFetchBridge(deps: BridgeDeps): FetchHandler {
  const { db, settings } = deps;
  const serverBaseUrl = (deps.serverBaseUrl ?? SERVER_BASE_URL ?? '').replace(/\/$/, '');
  const passthrough = deps.passthroughFetch ?? globalThis.fetch?.bind(globalThis);
  const isOnline = deps.isOnline ?? defaultOnline;

  /**
   * AI (and session probes) cannot be answered on-device. Offline, and whenever
   * the network itself refuses, they get one explicit envelope: 503 +
   * code NETWORK_REQUIRED. The shared UI's readEnvelope() turns that into a
   * visible error message, so an offline tab is a stated state — never a spinner
   * and never a silent success.
   */
  const NETWORK_REQUIRED_MESSAGE =
    'لا يوجد اتصال بالإنترنت · No connection — this needs the server';

  async function forward(url: RequestInfo | URL, init: RequestInit | undefined, rewrite: boolean): Promise<Response> {
    // auth + AI need the network: rewrite the relative path onto the server origin.
    // Everything else (absolute URLs, non-API paths) passes through untouched.
    let target = url;
    if (rewrite && serverBaseUrl && typeof url === 'string' && url.startsWith('/')) {
      target = `${serverBaseUrl}${url}`;
    }
    // Only the network-dependent family is gated; a plain asset fetch keeps the
    // platform's own error behaviour.
    if (rewrite && !isOnline()) {
      return fail(NETWORK_REQUIRED_MESSAGE, 503, 'NETWORK_REQUIRED');
    }
    if (!passthrough) {
      return fail('No network transport available for auth/AI requests', 502, 'NO_TRANSPORT');
    }
    try {
      return await passthrough(target as RequestInfo, init);
    } catch (err) {
      // A transport failure (no route, DNS, airplane mode racing the probe) must
      // surface as the same structured state, not as a rejected fetch promise.
      if (!rewrite) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      return fail(`${NETWORK_REQUIRED_MESSAGE} (${reason})`, 503, 'NETWORK_REQUIRED');
    }
  }

  return async function bridge(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' || input instanceof URL
      ? String(input)
      : (input as Request).url;
    const method = (
      init?.method
      ?? (typeof input !== 'string' && !(input instanceof URL) ? (input as Request).method : 'GET')
      ?? 'GET'
    ).toUpperCase();
    const { remote, pathname, search } = splitUrl(urlStr);

    // Never route an absolute cross-origin URL or a non-API path locally.
    if (remote || !pathname.startsWith('/api/')) {
      return forward(input, init, false);
    }

    if (pathname.startsWith('/api/auth/') || pathname.startsWith('/api/ai/')) {
      return forward(pathname + search.toString(), init, true);
    }

    const nowDate = (deps.now ?? (() => new Date()))();
    const nowIso = nowDate.toISOString();
    const at = nowDate.getTime();

    try {
      switch (pathname) {
        case '/api/vehicles':
          return await handleVehicles(db, method, search, await readBody(input, init), nowIso, at);
        case '/api/fuel':
          return await handleFuel(db, method, search, await readBody(input, init), nowIso, at);
        case '/api/maintenance':
          return await handleMaintenance(db, method, search, await readBody(input, init), nowIso, at);
        case '/api/schedules':
          return await handleSchedules(db, method, search, await readBody(input, init), at);
        case '/api/reports':
          return await handleReports(db, search);
        case '/api/settings':
          return handleSettings(settings, method, await readBody(input, init));
        case '/api/settings/fuel-prices':
          return method === 'GET' ? handleFuelPrices(search) : notImplemented(`GET /api/settings/fuel-prices (${method})`);
        case '/api/backup':
          if (method === 'GET') return await handleBackupExport(db, nowIso);
          if (method === 'POST') return await handleBackupRestore(db, await readBody(input, init), at);
          return notImplemented(`GET|POST /api/backup (${method})`);
        default:
          return notImplemented(`/api/${pathname.replace(/^\/api\//, '')} (${method})`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // GET failures surface as 500 like the routes; writes as 400.
      return fail(message, method === 'GET' ? 500 : 400);
    }
  };
}

/** Install the bridge over window.fetch. Returns a teardown that restores it. */
export function installFetchBridge(bridge: FetchHandler): () => void {
  if (typeof window === 'undefined') return () => {};
  const original = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => bridge(input, init)) as typeof window.fetch;
  return () => {
    window.fetch = original;
  };
}
