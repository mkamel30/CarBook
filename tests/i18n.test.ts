import { describe, it, expect } from 'vitest';
import { parseCfg } from '@/i18n/parser';
import { SUPPORTED_LANGUAGES, DICTIONARIES } from '@/i18n/config';

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
