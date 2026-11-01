import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDatabase } from '@/persistence/db';
import { StorageRepository } from '@/persistence/repository';
import { getOrFetchVehicleSchedules, resolveAiConfig } from '@/services/aiOrchestrator';
import { generateHeuristicSchedules } from '@/services/automotiveDatabase';

// T9 refusal coverage (AGENTS rule 3 + rule 8): AI structured output that does
// not satisfy the Zod schema must be REFUSED — never persisted as authority —
// retried a bounded number of times, and end in an explicit failure state.
//
// Transport note: src/services/ai.ts resolves the Gemini endpoint as
//   https://generativelanguage.googleapis.com/...?key=<apiKey>
// i.e. the API key rides in the query string. Every fetch here is mocked —
// zero real network calls, and the "key" is a fixed fake value so nothing
// sensitive is even in play.
const FAKE_GEMINI_KEY = 'test-key-never-real-0123456789';
const BAD_ITEM_CODE = 'BAD_SCHEMA_MARKER_item';
// Unknown to the preseeded OEM database → the orchestrator must consult the AI tier.
const MAKE = 'Proton';
const MODEL = 'Persona X5';
const YEAR = 2016;

let dbPath: string;
let repo: StorageRepository;

async function tableCounts() {
  const { client } = await getDatabase(dbPath);
  const out: Record<string, number> = {};
  for (const t of ['users', 'vehicles', 'fuel_logs', 'maintenance_logs', 'maintenance_schedules', 'global_vehicle_specs_cache']) {
    const res = await client.execute({ sql: `SELECT COUNT(*) AS c FROM ${t}`, args: [] });
    out[t] = Number((res.rows[0] as any).c);
  }
  return out;
}

beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), `carbook_airefusal_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
  repo = new StorageRepository(dbPath);
  await repo.findOrCreateUser({ id: 'ai_rc_u', email: 'ai-rc@example.com', name: 'AI RC' });
  // BYOK path: resolveAiConfig reads the global ai_api_key row first.
  await repo.setSetting('ai_api_key', FAKE_GEMINI_KEY);
  await repo.setSetting('ai_provider', 'gemini');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  try { await repo.close(); } catch { /* ignore */ }
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

/** Mock Gemini transport returning schema-invalid JSON (intervalKm: 0, missing titleAr). */
function stubGeminiSchemaFailure() {
  const mockFetch = vi.fn(async (url: any) => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              recommendedOil: '5W-30 Synthetic',
              maintenanceItems: [
                { itemCode: BAD_ITEM_CODE, titleEn: 'Missing Arabic title', intervalKm: 0 },
              ],
            }),
          }],
        },
      }],
    }),
  }));
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

describe('AI structured-output refusal (T9)', { timeout: 30_000 }, () => {
  it('refuses a schema-failing schedule proposal: bounded retries, zero invalid writes, explicit fallback state', async () => {
    const mockFetch = stubGeminiSchemaFailure();
    const before = await tableCounts();

    const result = await getOrFetchVehicleSchedules(MAKE, MODEL, YEAR, repo);

    // AGENTS rule 8 — bounded retries: exactly MAX_AI_ATTEMPTS (3) provider
    // calls for a persistently schema-invalid body, never an unbounded loop.
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // The Gemini transport reality: key is carried in the query string of a
    // public HTTPS generativelanguage.googleapis.com endpoint (mocked only).
    const firstUrl = String(mockFetch.mock.calls[0][0]);
    expect(firstUrl).toContain('https://generativelanguage.googleapis.com/');
    expect(firstUrl).toContain(`key=${FAKE_GEMINI_KEY}`);

    // Explicit failure state: the answer is NOT marked as AI authority.
    expect(result.source).toBe('automotive_heuristic');
    expect(result.fromCache).toBe(false);
    expect(['server_ai', 'user_ai', 'cache', 'preseeded_oem']).not.toContain(result.source);

    // REFUSED, not persisted: the invalid payload is nowhere in the database.
    const { client } = await getDatabase(dbPath);
    const dump = await client.execute({
      sql: `SELECT specs_json, schedules_json, source FROM global_vehicle_specs_cache WHERE make_normalized = ? AND model_normalized = ? AND year = ?`,
      args: [MAKE.toLowerCase(), MODEL.toLowerCase(), YEAR],
    });
    expect(dump.rows.length).toBe(1);
    const row = dump.rows[0] as any;
    expect(row.source).toBe('automotive_heuristic');
    const stored = `${row.specs_json ?? ''}|${row.schedules_json ?? ''}`;
    expect(stored).not.toContain(BAD_ITEM_CODE);
    expect(stored).not.toContain(FAKE_GEMINI_KEY);

    // What landed instead is precisely the local heuristic, not the model output.
    const heuristic = generateHeuristicSchedules(MAKE, MODEL, YEAR);
    expect(JSON.parse(row.schedules_json).recommendedOil).toBe(heuristic.recommendedOil);

    // Zero stray DB writes: the only growth vs. baseline is the single cache row.
    const after = await tableCounts();
    for (const t of ['users', 'vehicles', 'fuel_logs', 'maintenance_logs', 'maintenance_schedules']) {
      expect(after[t]).toBe(before[t]);
    }
    expect(after.global_vehicle_specs_cache).toBe(before.global_vehicle_specs_cache + 1);
  });

  it('does not retry a non-retryable provider failure (redirect) — one bounded attempt, heuristic fallback', async () => {
    const mockFetch = vi.fn(async () => ({ ok: false, status: 302 })) as any;
    vi.stubGlobal('fetch', mockFetch);

    const result = await getOrFetchVehicleSchedules(MAKE, MODEL, YEAR + 1, repo);
    // NonRetryableAiError escapes the retry loop immediately (AGENTS rule 8).
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('automotive_heuristic');
  });

  it('config resolution stays provider-correct without any network call', async () => {
    const config = await resolveAiConfig(repo);
    expect(config.hasKey).toBe(true);
    expect(config.provider).toBe('gemini');
    expect(config.isServerManaged).toBe(false); // BYOK row, not the server env
    expect(config.apiKey).toBe(FAKE_GEMINI_KEY);
  });

  // TODO(T9 → session agent): /api/auth/login|logout|device rate limiting and
  // jti revocation land in the session slice; AI-endpoint abuse throttling
  // coverage waits for that — deliberately not asserted here.
});
