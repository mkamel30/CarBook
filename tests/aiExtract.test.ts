import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { receiptExtractionSchema, extractReceiptFromImage } from '@/services/ai';

// Route-level tests below import the real handler, which constructs a default
// StorageRepository; CARBOOK_DB_PATH must be set before that first use.
const dbPath = path.join(
  os.tmpdir(),
  `carbook_aiextract_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
);
process.env.CARBOOK_DB_PATH = dbPath;
process.env.JWT_SECRET = 'aiextract_test_secret_pad';
process.env.SERVER_GEMINI_API_KEY = 'test-gemini-key';

import { signSessionToken } from '@/services/auth';
import { POST as extractPost } from '@/app/api/ai/extract/route';

const USER = { id: 'aiextract_user', email: 'aiextract@example.com', name: 'AI Extract', picture: null };

afterAll(() => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('receiptExtractionSchema', () => {
  it('accepts a full reading', () => {
    const parsed = receiptExtractionSchema.parse({
      date: '2024-06-01', liters: 40, pricePerLiter: 20, total: 800, odometer: 150000, confidence: 0.9,
    });
    expect(parsed.odometer).toBe(150000);
    expect(parsed.confidence).toBe(0.9);
  });

  it('accepts a partial reading with nulls (odometer photo: no fuel fields)', () => {
    const parsed = receiptExtractionSchema.parse({
      date: null, liters: null, pricePerLiter: null, total: null, odometer: 150000, confidence: 0.8,
    });
    expect(parsed.liters).toBeNull();
    expect(parsed.odometer).toBe(150000);
  });

  it('rejects a confidence outside 0..1', () => {
    expect(() => receiptExtractionSchema.parse({ confidence: 1.5 })).toThrow();
    expect(() => receiptExtractionSchema.parse({ confidence: -0.1 })).toThrow();
  });

  it('rejects a negative liters value', () => {
    expect(() => receiptExtractionSchema.parse({ liters: -5, confidence: 0.5 })).toThrow();
  });
});

describe('extractReceiptFromImage (gemini provider, injected fetch)', () => {
  const config = { apiKey: 'k', provider: 'gemini' as const };
  const geminiJson = (text: string) =>
    ({ candidates: [{ content: { parts: [{ text }] } }] });

  it('returns the Zod-validated extraction', async () => {
    const fetchFn = (async () => ({
      ok: true, status: 200,
      json: async () => geminiJson(
        JSON.stringify({ date: '2024-06-01', liters: 40, pricePerLiter: 20, total: 800, odometer: 150000, confidence: 0.9 }),
      ),
    })) as unknown as typeof fetch;

    const result = await extractReceiptFromImage('AAAA', 'image/jpeg', config, fetchFn);
    expect(result).toMatchObject({ liters: 40, total: 800, odometer: 150000, confidence: 0.9 });
  });

  it('sends the image inline to Gemini', async () => {
    const bodies: string[] = [];
    const fetchFn = (async (_url: any, init: any) => {
      bodies.push(init.body);
      return {
        ok: true, status: 200,
        json: async () => geminiJson(JSON.stringify({ confidence: 0.5 })),
      };
    }) as unknown as typeof fetch;

    await extractReceiptFromImage('QUJD', 'image/png', config, fetchFn);
    const sent = JSON.parse(bodies[0]);
    const part = sent.contents[0].parts.find((p: any) => p.inline_data);
    expect(part.inline_data).toEqual({ mime_type: 'image/png', data: 'QUJD' });
  });

  it('gives up after the bounded retry budget with a clean error', async () => {
    const fetchFn = (async () => ({
      ok: false, status: 500, json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(
      extractReceiptFromImage('QUJD', 'image/jpeg', config, fetchFn),
    ).rejects.toThrow(/failed after 3 attempts/);
  });
});

describe('POST /api/ai/extract — route-level contract', () => {
  const token = () => signSessionToken(USER);
  const req = (body: any, auth = true) =>
    new NextRequest('http://localhost:3070/api/ai/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: `Bearer ${token()}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it('requires authentication', async () => {
    const res = await extractPost(req({ image: 'QUJD', mimeType: 'image/jpeg' }, false));
    expect(res.status).toBe(401);
  });

  it('rejects a missing image', async () => {
    const res = await extractPost(req({ mimeType: 'image/jpeg' }));
    expect(res.status).toBe(400);
  });

  it('rejects a non-image mime type', async () => {
    const res = await extractPost(req({ image: 'QUJD', mimeType: 'text/html' }));
    expect(res.status).toBe(400);
  });

  it('rejects non-base64 payloads before spending the provider key', async () => {
    const res = await extractPost(req({ image: 'not base64!!!', mimeType: 'image/jpeg' }));
    expect(res.status).toBe(400);
  });

  it('extracts fields through the configured provider', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ date: '2024-06-01', liters: 40, pricePerLiter: 20, total: 800, confidence: 0.9 }) }] } }],
      }),
    })));

    const res = await extractPost(req({ image: 'QUJD', mimeType: 'image/jpeg' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ liters: 40, total: 800, confidence: 0.9 });
  });
});
