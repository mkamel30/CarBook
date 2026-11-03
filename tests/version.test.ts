import { describe, it, expect } from 'vitest';
import { semverToVersionCode, CURRENT_CLIENT_VERSION } from '@/services/version';

// The Gradle build derives versionCode = major*10000 + minor*100 + patch from
// package.json "version". These assertions pin the JS mirror to that formula so
// the update banner can never disagree with Android's versionCode.
describe('semverToVersionCode (mirrors the Gradle formula)', () => {
  it('maps 1.0.0 to the versionCode 10000', () => {
    expect(semverToVersionCode('1.0.0')).toBe(10000);
  });

  it('maps a patch bump to +1', () => {
    expect(semverToVersionCode('1.0.1')).toBe(10001);
  });

  it('maps minor and major components to their place values', () => {
    expect(semverToVersionCode('1.2.3')).toBe(10203);
    expect(semverToVersionCode('2.0.0')).toBe(20000);
  });

  it('treats a missing or empty version as 0 (never newer)', () => {
    expect(semverToVersionCode(null)).toBe(0);
    expect(semverToVersionCode(undefined)).toBe(0);
    expect(semverToVersionCode('')).toBe(0);
  });

  it('keeps the installed client version consistent with package.json', () => {
    expect(CURRENT_CLIENT_VERSION).toBe('1.0.0');
    expect(semverToVersionCode(CURRENT_CLIENT_VERSION)).toBe(10000);
  });
});
