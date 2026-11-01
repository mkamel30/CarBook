import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseCfg } from '@/i18n/parser';
import { SUPPORTED_LANGUAGES, DICTIONARIES } from '@/i18n/config';
import { pluralCategory, interpolate, translate } from '@/i18n/resolve';
import { nextLang, formatDate } from '@/i18n/util';

describe('i18n CFG Parser', () => {
  it('correctly parses .cfg files ignoring comments and empty lines', () => {
    const sampleCfg = `
# Language Configuration
lang_code = en
lang_name = English
dir = ltr

; Another comment style
app_name = CarBook
welcome = Welcome to CarBook!
`;

    const parsed = parseCfg(sampleCfg);
    expect(parsed.lang_code).toBe('en');
    expect(parsed.lang_name).toBe('English');
    expect(parsed.dir).toBe('ltr');
    expect(parsed.app_name).toBe('CarBook');
    expect(parsed.welcome).toBe('Welcome to CarBook!');
    expect(Object.keys(parsed).length).toBe(5);
  });

  it('handles values with equals signs properly', () => {
    const sample = `formula = 2 + 2 = 4`;
    const parsed = parseCfg(sample);
    expect(parsed.formula).toBe('2 + 2 = 4');
  });

  it('correctly loads and parses Polish language dictionary', () => {
    const plLang = SUPPORTED_LANGUAGES.find((l: any) => l.code === 'pl');
    expect(plLang).toBeDefined();
    expect(plLang?.name).toBe('Polski');
    expect(plLang?.dir).toBe('ltr');

    const plDict = DICTIONARIES['pl'];
    expect(plDict).toBeDefined();
    expect(plDict.app_name).toBe('CarBook');
    expect(plDict.nav_fuel).toBe('Tankowania i spalanie');
    expect(plDict.nav_maintenance).toBe('Serwis i naprawy');
  });
});

describe('i18n key parity (ar / en / pl)', () => {
  const codes = ['ar', 'en', 'pl'];

  it('every key in each dictionary exists in all others', () => {
    for (const code of codes) {
      const keys = Object.keys(DICTIONARIES[code]);
      expect(keys.length).toBeGreaterThan(0);
      for (const other of codes.filter((c) => c !== code)) {
        const missing = keys.filter((k) => DICTIONARIES[other][k] === undefined);
        expect(missing, `keys in ${code} missing from ${other}`).toEqual([]);
      }
    }
  });

  it('all plural variant families are complete (one/two/few/many/other)', () => {
    const bases = new Set(
      Object.keys(DICTIONARIES.en)
        .filter((k) => k.includes('__'))
        .map((k) => k.slice(0, k.lastIndexOf('__'))),
    );
    for (const base of bases) {
      for (const code of codes) {
        for (const category of ['one', 'two', 'few', 'many', 'other']) {
          expect(DICTIONARIES[code], `${code} lacks ${base}__${category}`).toHaveProperty(
            `${base}__${category}`,
          );
        }
      }
    }
  });

  it('src/locales/*.cfg mirrors match the embedded runtime dictionaries exactly', () => {
    for (const code of codes) {
      const mirrorPath = path.resolve(process.cwd(), 'src', 'locales', `${code}.cfg`);
      expect(fs.existsSync(mirrorPath), `missing generated mirror ${code}.cfg`).toBe(true);
      const raw = fs.readFileSync(mirrorPath, 'utf8');
      expect(raw, `${code}.cfg must carry the GENERATED banner`).toContain('GENERATED FILE');
      expect(parseCfg(raw)).toEqual(DICTIONARIES[code]);
    }
  });
});

describe('i18n fallback chain (lang -> en -> ar -> fallback -> key)', () => {
  it('prefers the active language, then en, then ar', () => {
    const dicts = {
      xx: { only_here: 'XX' },
      en: { only_here: 'EN', shared: 'EN-shared', ar_only: 'no' },
      ar: { arabic_only: 'AR', shared: 'AR-shared', ar_only: 'AR-only' },
    };
    expect(translate(dicts, 'xx', 'only_here')).toBe('XX');
    expect(translate(dicts, 'xx', 'shared')).toBe('EN-shared');
    expect(translate(dicts, 'xx', 'arabic_only')).toBe('AR');
    expect(translate(dicts, 'ar', 'shared')).toBe('AR-shared');
  });

  it('returns the legacy string fallback, then the key itself, when unresolved', () => {
    expect(translate(DICTIONARIES, 'en', 'key_that_does_not_exist', 'FALLBACK')).toBe('FALLBACK');
    expect(translate(DICTIONARIES, 'en', 'key_that_does_not_exist')).toBe('key_that_does_not_exist');
  });

  it('keeps t(key, fallback) and t(key, vars) distinguishable by argument type', () => {
    expect(translate(DICTIONARIES, 'en', 'app_name', 'Car')).toBe('CarBook');
    expect(translate(DICTIONARIES, 'en', 'alerts_overdue_by', { km: 250 })).toBe('Overdue by 250 km');
  });
});

describe('i18n interpolation', () => {
  it('substitutes {name} placeholders across all languages', () => {
    expect(interpolate('Overdue by {km} km', { km: 42 })).toBe('Overdue by 42 km');
    for (const code of ['ar', 'en', 'pl']) {
      expect(translate(DICTIONARIES, code, 'alerts_overdue_by', { km: 120 })).toBe(
        DICTIONARIES[code].alerts_overdue_by.replace('{km}', '120'),
      );
    }
  });

  it('leaves unknown placeholders untouched instead of erasing content', () => {
    expect(interpolate('Hello {name} at {place}', { name: 'Mo' })).toBe('Hello Mo at {place}');
  });
});

describe('i18n plural matrix', () => {
  it('categorises Arabic counts per CLDR-style spec (0->many, 1->one, 2->two, 3-10->few, 11+->many)', () => {
    expect(pluralCategory('ar', 0)).toBe('many');
    expect(pluralCategory('ar', 1)).toBe('one');
    expect(pluralCategory('ar', 2)).toBe('two');
    for (const n of [3, 4, 7, 10]) expect(pluralCategory('ar', n)).toBe('few');
    for (const n of [11, 15, 100, 101]) expect(pluralCategory('ar', n)).toBe('many');
  });

  it('categorises non-Arabic counts as one/other', () => {
    expect(pluralCategory('en', 1)).toBe('one');
    expect(pluralCategory('en', 0)).toBe('other');
    expect(pluralCategory('en', 3)).toBe('other');
    expect(pluralCategory('pl', -1)).toBe('one');
  });

  it('selects the right variant and interpolates {count} through t()', () => {
    expect(translate(DICTIONARIES, 'en', 'notif_urgent_items', { count: 1 }, 1)).toBe('1 item due');
    expect(translate(DICTIONARIES, 'en', 'notif_urgent_items', { count: 4 }, 4)).toBe('4 items due');
    expect(translate(DICTIONARIES, 'ar', 'notif_urgent_items', { count: 1 }, 1)).toBe(
      DICTIONARIES.ar.notif_urgent_items__one,
    );
    expect(translate(DICTIONARIES, 'ar', 'notif_urgent_items', { count: 2 }, 2)).toBe(
      DICTIONARIES.ar.notif_urgent_items__two,
    );
    expect(translate(DICTIONARIES, 'ar', 'notif_urgent_items', { count: 7 }, 7)).toBe(
      DICTIONARIES.ar.notif_urgent_items__few.replace('{count}', '7'),
    );
    expect(translate(DICTIONARIES, 'ar', 'notif_urgent_items', { count: 12 }, 12)).toBe(
      DICTIONARIES.ar.notif_urgent_items__many.replace('{count}', '12'),
    );
    expect(translate(DICTIONARIES, 'pl', 'rep_records_count', { count: 1 }, 1)).toBe(
      '1 zapisany wpis',
    );
    // Non-Arabic languages resolve one/other only (pl keeps __many for data
    // parity, but the engine's documented behaviour is one|other).
    expect(translate(DICTIONARIES, 'pl', 'rep_records_count', { count: 12 }, 12)).toBe(
      '12 zapisane wpisy',
    );
  });

  it('reads count from vars when no explicit count argument is given', () => {
    expect(translate(DICTIONARIES, 'en', 'rep_records_count', { count: 1 })).toBe('1 record logged');
  });

  it('falls back to the base key when no plural variant exists', () => {
    expect(translate(DICTIONARIES, 'en', 'app_name', { count: 5 }, 5)).toBe('CarBook');
  });
});

describe('i18n currency + locale helpers', () => {
  it('uses EGP/ج.م currency units (not hardcoded $)', () => {
    expect(DICTIONARIES.en.unit_currency).toBe('EGP');
    expect(DICTIONARIES.ar.unit_currency).toBe('ج.م');
  });

  it('cycles language ar -> en -> pl -> ar', () => {
    expect(nextLang('ar')).toBe('en');
    expect(nextLang('en')).toBe('pl');
    expect(nextLang('pl')).toBe('ar');
    expect(nextLang('unknown')).toBe('ar');
  });

  it('formats ISO dates per language without timezone day-shift', () => {
    expect(formatDate('2026-02-09', 'en')).toContain('2026');
    expect(formatDate('2026-02-09', 'en')).toMatch(/Feb/);
    expect(formatDate('2026-02-09', 'pl')).toMatch(/lut/);
    expect(formatDate('2026-02-09', 'ar')).not.toBe('2026-02-09');
    expect(formatDate('2026-01-01', 'en')).toMatch(/1.*Jan/);
    expect(formatDate('', 'en')).toBe('');
    expect(formatDate(null, 'en')).toBe('');
    expect(formatDate('not-a-date', 'en')).toBe('not-a-date');
  });
});
