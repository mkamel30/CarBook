import { describe, it, expect } from 'vitest';
import {
  normalizeSha256,
  sha256Hex,
  verifyApkIntegrity,
} from '@/services/apkIntegrity';

const enc = new TextEncoder();

describe('normalizeSha256', () => {
  it('strips the GitHub "sha256:" prefix and lowercases', () => {
    const hex = 'ab'.repeat(32);
    expect(normalizeSha256(`sha256:${hex.toUpperCase()}`)).toBe(hex);
  });

  it('accepts a bare 64-char hex digest', () => {
    const hex = 'ab'.repeat(32);
    expect(normalizeSha256(hex)).toBe(hex);
  });

  it('returns null for empty, missing, or malformed digests', () => {
    expect(normalizeSha256(null)).toBeNull();
    expect(normalizeSha256(undefined)).toBeNull();
    expect(normalizeSha256('')).toBeNull();
    expect(normalizeSha256('sha256:xyz')).toBeNull();
    expect(normalizeSha256('abc123')).toBeNull();
  });
});

describe('sha256Hex', () => {
  it('computes the known SHA-256 of "abc"', async () => {
    const hex = await sha256Hex(enc.encode('abc').buffer);
    expect(hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('verifyApkIntegrity', () => {
  const bytes = enc.encode('apk bytes').buffer;
  const matchingFetch = async () => new Response(bytes.slice(0));

  it('verifies a matching digest', async () => {
    const expected = await sha256Hex(bytes);
    const res = await verifyApkIntegrity({
      apkUrl: 'https://example.com/app.apk',
      expectedSha256: expected,
      fetchFn: matchingFetch as unknown as typeof fetch,
    });
    expect(res).toEqual({ verified: true, reason: 'match' });
  });

  it('rejects a mismatching digest', async () => {
    const res = await verifyApkIntegrity({
      apkUrl: 'https://example.com/app.apk',
      expectedSha256: 'ab'.repeat(32),
      fetchFn: matchingFetch as unknown as typeof fetch,
    });
    expect(res).toEqual({ verified: false, reason: 'mismatch' });
  });

  it('treats a missing expected digest as verified without downloading', async () => {
    let called = false;
    const res = await verifyApkIntegrity({
      apkUrl: 'https://example.com/app.apk',
      expectedSha256: null,
      fetchFn: (async () => {
        called = true;
        return new Response(bytes.slice(0));
      }) as unknown as typeof fetch,
    });
    expect(res).toEqual({ verified: true, reason: 'not_advertised' });
    expect(called).toBe(false);
  });

  it('reports unverifiable when the download fails', async () => {
    const res = await verifyApkIntegrity({
      apkUrl: 'https://example.com/app.apk',
      expectedSha256: 'ab'.repeat(32),
      fetchFn: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    expect(res).toEqual({ verified: false, reason: 'unverifiable' });
  });

  it('reports unverifiable on a non-2xx response', async () => {
    const res = await verifyApkIntegrity({
      apkUrl: 'https://example.com/app.apk',
      expectedSha256: 'ab'.repeat(32),
      fetchFn: (async () => new Response(null, { status: 404 })) as unknown as typeof fetch,
    });
    expect(res).toEqual({ verified: false, reason: 'unverifiable' });
  });
});
