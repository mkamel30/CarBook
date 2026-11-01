import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { StorageRepository } from '@/persistence/repository';
import { getDatabase } from '@/persistence/db';
import { signAccessToken } from '@/services/auth';
import { getFuelPresetsByCountry } from '@/services/geoPricing';
import { POST as postSettings, GET as getSettings } from '@/app/api/settings/route';

// Per-user settings slice (T4) + fuel-price fallback parity (T3b).
// The routes build a default StorageRepository, so CARBOOK_DB_PATH must point
// at a throwaway file before the first handler runs.
const dbPath = path.join(os.tmpdir(), `carbook_settings_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
process.env.CARBOOK_DB_PATH = dbPath;

const A = { id: 'user-a', email: 'a@example.com', name: 'A', picture: null };
const B = { id: 'user-b', email: 'b@example.com', name: 'B', picture: null };
const C = { id: 'user-c', email: 'c@example.com', name: 'C', picture: null };

function bearer(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}
function makeReq(url: string, init: any = {}): NextRequest {
  return new NextRequest(`http://localhost:3070${url}`, init);
}

let repo: StorageRepository;
let tokenA: string;
let tokenB: string;
let tokenC: string;

beforeAll(async () => {
  repo = new StorageRepository();
  await repo.findOrCreateUser({ id: A.id, email: A.email, name: A.name });
  await repo.findOrCreateUser({ id: B.id, email: B.email, name: B.name });
  await repo.findOrCreateUser({ id: C.id, email: C.email, name: C.name });
  tokenA = signAccessToken(A);
  tokenB = signAccessToken(B);
  tokenC = signAccessToken(C);
});

afterAll(async () => {
  try { await repo.close(); } catch { /* ignore */ }
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

describe('per-user settings (T4)', () => {
  it('stores ai_api_key per user: invisible to another user, and no longer claims encryption', async () => {
    const res = await postSettings(makeReq('/api/settings', {
      method: 'POST', headers: bearer(tokenA), body: JSON.stringify({ apiKey: 'sk-user-a-secret' }),
    }));
    expect(res.status).toBe(200);

    // Owner sees it…
    expect(await repo.getSetting('ai_api_key', A.id)).toBe('sk-user-a-secret');
    // …another user and the anonymous/global read do not.
    expect(await repo.getSetting('ai_api_key', B.id)).toBeNull();
    expect(await repo.getSetting('ai_api_key')).toBeNull();

    // A second user writing their own key must not touch the first row ((key, user_id) key).
    await postSettings(makeReq('/api/settings', {
      method: 'POST', headers: bearer(tokenB), body: JSON.stringify({ apiKey: 'sk-user-b-other' }),
    }));
    expect(await repo.getSetting('ai_api_key', A.id)).toBe('sk-user-a-secret');
    expect(await repo.getSetting('ai_api_key', B.id)).toBe('sk-user-b-other');

    const getA = await (await getSettings(makeReq('/api/settings', { headers: bearer(tokenA) }))).json();
    const getB = await (await getSettings(makeReq('/api/settings', { headers: bearer(tokenB) }))).json();
    expect(getA.data.hasApiKey).toBe(true);
    expect(getA.data.maskedApiKey).toBe('sk-u...cret');
    // B's mask comes from B's own key only — A's secret never reaches B's response.
    expect(getB.data.maskedApiKey).toBe('sk-u...ther');
    expect(JSON.stringify(getB)).not.toContain('secret');

    // is_encrypted is recorded truthfully: plaintext-at-rest, no cosmetic true flag.
    const { client } = await getDatabase(dbPath);
    const row = await client.execute({
      sql: `SELECT is_encrypted FROM app_settings WHERE key = 'ai_api_key' AND user_id = ?`,
      args: [A.id],
    });
    expect(Number((row.rows[0] as any).is_encrypted)).toBe(0);
  });

  it('keeps ai_provider global (legacy contract) while keys/fuel types go per user', async () => {
    const res = await postSettings(makeReq('/api/settings', {
      method: 'POST', headers: bearer(tokenA), body: JSON.stringify({ provider: 'openrouter' }),
    }));
    expect(res.status).toBe(200);
    expect(await repo.getSetting('ai_provider')).toBe('openrouter');
    expect(await repo.getSetting('ai_provider', B.id)).toBe('openrouter');
  });

  it('falls back to the official geoPricing EG preset, never to stale hardcoded prices (T3b)', async () => {
    // Declared before the legacy-global-row test: with no fuel_types row at all
    // anywhere, the route must serve the geoPricing preset.
    const getC = await (await getSettings(makeReq('/api/settings', { headers: bearer(tokenC) }))).json();
    // Parity: the route fallback is literally the geoPricing preset, so they cannot drift.
    expect(getC.data.fuelTypes).toEqual(getFuelPresetsByCountry('EG').fuelTypes);
    const byId = Object.fromEntries(getC.data.fuelTypes.map((f: any) => [f.id, f.price]));
    expect(byId).toMatchObject({ gasoline_95: 24.0, gasoline_92: 22.25, gasoline_80: 20.75, diesel: 20.50, cng: 13.0 });
    // The old stale values must be gone.
    expect(byId.gasoline_92).not.toBe(15.25);
    expect(byId.gasoline_95).not.toBe(17.0);
  });

  it('serves fuel_types per user with the legacy global row as fallback', async () => {
    const legacy = [{ id: 'gasoline_92', name: 'بنزين 92 (legacy global)', price: 22.25 }];
    // A pre-existing global row (user_id '') written by legacy code stays readable
    // as the default for users who have no per-user row.
    await repo.setSetting('fuel_types', JSON.stringify(legacy));

    const getB = await (await getSettings(makeReq('/api/settings', { headers: bearer(tokenB) }))).json();
    expect(getB.data.fuelTypes).toEqual(legacy);

    // User A stores their own list: A sees theirs, B still sees the global fallback.
    const mine = [{ id: 'diesel', name: 'سولار', price: 20.5 }];
    await postSettings(makeReq('/api/settings', {
      method: 'POST', headers: bearer(tokenA), body: JSON.stringify({ fuelTypes: mine }),
    }));
    const getA = await (await getSettings(makeReq('/api/settings', { headers: bearer(tokenA) }))).json();
    const getB2 = await (await getSettings(makeReq('/api/settings', { headers: bearer(tokenB) }))).json();
    expect(getA.data.fuelTypes).toEqual(mine);
    expect(getB2.data.fuelTypes).toEqual(legacy);

    // Per-user write must not clobber the global row.
    expect(await repo.getSetting('fuel_types')).toEqual(JSON.stringify(legacy));
  });

  it('scopes AI-derived spec cache rows to their owner while official rows stay global', async () => {
    await repo.saveGlobalSpecCache('Toyota', 'Corolla', 2022, { engineOilViscosity: '5W-30' }, null, '5W-30', 'official');
    await repo.saveGlobalSpecCache('Toyota', 'Corolla', 2022, { engineOilViscosity: '0W-20-ai-A' }, null, '0W-20', 'ai', A.id);

    const a = await repo.getGlobalSpecCache('Toyota', 'Corolla', 2022, A.id);
    expect(a?.source).toBe('ai');
    expect(a?.specs.engineOilViscosity).toBe('0W-20-ai-A');

    // User B (and owner-less reads) only ever see the official global row.
    const b = await repo.getGlobalSpecCache('Toyota', 'Corolla', 2022, B.id);
    expect(b?.source).toBe('official');
    expect(b?.specs.engineOilViscosity).toBe('5W-30');
    const global = await repo.getGlobalSpecCache('Toyota', 'Corolla', 2022);
    expect(global?.source).toBe('official');
  });
});
