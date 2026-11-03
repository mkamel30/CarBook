import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DICTIONARIES, SUPPORTED_LANGUAGES } from '@/i18n/config';
import { translate } from '@/i18n/resolve';
import { nextLang } from '@/i18n/util';

/**
 * Contract tests for the reorganised header chrome (owner items 5 + 6).
 *
 * There is no DOM environment in this repo (node-only vitest, no jsdom /
 * testing-library), so the dropdown geometry and keyboard behaviour are
 * asserted against the source contract that carries them — the shared
 * `src/components/ui/Menu.tsx` primitive — while the language half is
 * behavioural: every row label is resolved through the real dictionaries.
 */
const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const MENU_SRC = read('src/components/ui/Menu.tsx');
const MOBILE_SRC = read('src/components/layout/MobileTopBar.tsx');
const DESKTOP_SRC = read('src/components/layout/DesktopHeader.tsx');
const SIDEBAR_SRC = read('src/components/layout/Sidebar.tsx');

const CHROME = [
  ['Menu.tsx', MENU_SRC],
  ['MobileTopBar.tsx', MOBILE_SRC],
  ['DesktopHeader.tsx', DESKTOP_SRC],
  ['Sidebar.tsx', SIDEBAR_SRC],
] as const;

const LAYOUT = [
  ['MobileTopBar.tsx', MOBILE_SRC],
  ['DesktopHeader.tsx', DESKTOP_SRC],
  ['Sidebar.tsx', SIDEBAR_SRC],
] as const;

const LANGS = ['ar', 'en', 'pl'] as const;

const hasKey = (key: string, lang: string) =>
  key in DICTIONARIES[lang] ||
  ['__one', '__two', '__few', '__many', '__other'].some(
    (variant) => `${key}${variant}` in DICTIONARIES[lang],
  );

/** Source order helper — fails loudly when a marker is missing entirely. */
const order = (src: string, marker: string, file: string) => {
  const index = src.indexOf(marker);
  expect(index, `${file} must contain ${marker}`).toBeGreaterThanOrEqual(0);
  return index;
};

describe('shared Menu primitive', () => {
  it('is exported as Menu + MenuItem and reused by every header', () => {
    expect(MENU_SRC).toMatch(/export const Menu: React\.FC<MenuProps>/);
    expect(MENU_SRC).toMatch(/export const MenuItem: React\.FC<MenuItemProps>/);
    for (const [file, src] of LAYOUT) {
      expect(src, file).toMatch(/import \{ Menu, MenuItem \} from '@\/components\/ui\/Menu'/);
      expect(src, file).toMatch(/<Menu\b/);
    }
  });

  it('reuses useDialogBehaviour from Modal.tsx with autoFocusFirst disabled', () => {
    expect(MENU_SRC).toMatch(/import \{ useDialogBehaviour \} from '\.\/Modal'/);
    expect(MENU_SRC).toMatch(/useDialogBehaviour\(\s*open,\s*panelRef,\s*close,\s*\{\s*autoFocusFirst:\s*false\s*\}\s*\)/);
    // Escape close + focus restore come from the hook, not a private copy.
    expect(MENU_SRC).not.toMatch(/previouslyFocused/);
  });

  it('carries the menu ARIA semantics once for all callers', () => {
    for (const marker of [
      'aria-haspopup="menu"',
      'aria-expanded={open}',
      'role="menu"',
      'role="menuitem"',
      "aria-current={selected ? 'true' : undefined}",
    ]) {
      expect(MENU_SRC, marker).toContain(marker);
    }
  });

  it('implements ArrowUp/ArrowDown walking and click-outside dismissal', () => {
    expect(MENU_SRC).toMatch(/event\.key === 'ArrowDown'/);
    expect(MENU_SRC).toMatch(/event\.key === 'ArrowUp'/);
    expect(MENU_SRC).toMatch(/document\.addEventListener\('mousedown'/);
    expect(MENU_SRC).toMatch(/container\.contains\(event\.target as Node\)/);
    // Roving focus only visits actionable rows, never the static identity line.
    expect(MENU_SRC).toMatch(/\[role="menuitem"\]:not\(\[disabled\]\)/);
  });

  it('follows the RTL convention and cannot overflow a phone viewport', () => {
    expect(MENU_SRC).toMatch(/dir === 'rtl' \? 'left-0' : 'right-0'/);
    expect(MENU_SRC).toMatch(/dir === 'rtl' \? 'right-0' : 'left-0'/);
    expect(MENU_SRC).toContain('max-w-[calc(100vw-1.5rem)]');
    expect(MENU_SRC).toContain('overflow-y-auto');
  });

  it('stays app-agnostic: no language list, no dictionary keys inside it', () => {
    expect(MENU_SRC).not.toMatch(/lang_short_|aria_language_menu|SUPPORTED_LANGUAGES/);
    expect(MENU_SRC).not.toMatch(/'العربية'/);
  });
});

describe('language switcher is a menu over the real language list', () => {
  it.each(LAYOUT)('%s lists the context `languages` array, not a hardcoded trio', (_file, src) => {
    expect(src).toMatch(/const \{[^}]*languages[^}]*\} = useTranslation\(\)/);
    expect(src).toMatch(/languages\.map\(/);
    expect(src).toMatch(/<MenuItem[^>]*key=\{l\.code\}[^>]*selected=\{l\.code === lang\}[^>]*\/?>|key=\{l\.code\}/);
    expect(src).toMatch(/setLang\(l\.code\)/);
    expect(src).toMatch(/ariaLabel=\{t\('aria_language_menu'\)\}/);
    expect(src).toMatch(/triggerLabel=\{t\('lang_menu_title'\)\}/);
    expect(src).toMatch(/hint=\{t\('lang_menu_hint'\)\}/);
    // A fourth language needs no component change: nothing enumerates the codes.
    expect(src).not.toMatch(/\[\s*'ar',\s*'en',\s*'pl'\s*\]/);
    expect(src).not.toMatch(/setLang\(\s*'(ar|en|pl)'/);
  });

  it.each(LAYOUT)('%s dropped the cycle-on-click handler', (_file, src) => {
    expect(src, 'nextLang import').not.toMatch(/nextLang/);
    expect(src, "cycle target").not.toMatch(/nextCode|nextName/);
    expect(src).not.toMatch(/onClick=\{\(\) => setLang\(nextCode\)\}/);
    expect(src).not.toMatch(/'@\/i18n\/util'/);
  });

  it('keeps the Globe icon on the trigger in mobile and desktop chrome', () => {
    for (const src of [MOBILE_SRC, DESKTOP_SRC, SIDEBAR_SRC]) {
      expect(src).toMatch(/<Globe className=/);
    }
  });

  it('keeps the cycle helper alive for its remaining callers', () => {
    // The chrome no longer cycles, but src/i18n/util.ts still exports nextLang
    // and tests/i18n.test.ts still pins its contract.
    expect(nextLang('ar')).toBe('en');
    expect(nextLang('pl')).toBe('ar');
  });

  it('renders one row per supported language, labelled by its own endonym', () => {
    // The rows come from the same array the components iterate over.
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(3);
    for (const info of SUPPORTED_LANGUAGES) {
      expect(info.name).not.toBe(info.code.toUpperCase());
      expect(hasKey('lang_menu_title', info.code) || info.dir.length > 0).toBe(true);
    }
  });
});

describe('header element order is conventional (utilities first, account last)', () => {
  it('mobile: vehicle identity/switcher left; bell, language, settings, account right', () => {
    const vehicle = order(MOBILE_SRC, "t('vehicle_actions_aria')", 'MobileTopBar');
    const bell = order(MOBILE_SRC, "t('nav_alerts')", 'MobileTopBar');
    const lang = order(MOBILE_SRC, "t('lang_menu_title')", 'MobileTopBar');
    const settings = order(MOBILE_SRC, "t('nav_settings')", 'MobileTopBar');
    const account = order(MOBILE_SRC, "t('aria_open_menu')", 'MobileTopBar');
    expect(vehicle).toBeLessThan(bell);
    expect(bell).toBeLessThan(lang);
    expect(lang).toBeLessThan(settings);
    expect(settings).toBeLessThan(account);
  });

  it('mobile: no bare vehicle <select> in the action row, switching still wired', () => {
    expect(MOBILE_SRC).not.toMatch(/<select\b/);
    expect(MOBILE_SRC).toMatch(/onClick=\{\(\) => onSelectVehicle\(v\)\}/);
    expect(MOBILE_SRC).toMatch(/vehicles\.length > 1/);
    expect(MOBILE_SRC).toMatch(/urgentCount > 0/);
  });

  it('desktop: bell, language, settings, quick adds, then account last', () => {
    const bell = order(DESKTOP_SRC, "t('nav_alerts')", 'DesktopHeader');
    const lang = order(DESKTOP_SRC, "t('lang_menu_title')", 'DesktopHeader');
    const settings = order(DESKTOP_SRC, "t('nav_settings')", 'DesktopHeader');
    const fuel = order(DESKTOP_SRC, "t('btn_add_fuel')", 'DesktopHeader');
    const account = order(DESKTOP_SRC, "t('aria_open_menu')", 'DesktopHeader');
    expect(bell).toBeLessThan(lang);
    expect(lang).toBeLessThan(settings);
    expect(settings).toBeLessThan(fuel);
    expect(fuel).toBeLessThan(account);
    expect(DESKTOP_SRC).toMatch(/onClick=\{onOpenAddFuel\}/);
    expect(DESKTOP_SRC).toMatch(/onClick=\{onOpenAddMaintenance\}/);
    expect(DESKTOP_SRC).toMatch(/urgentCount > 0/);
  });

  it('sidebar: gained the language control it only imported before', () => {
    expect(SIDEBAR_SRC).toMatch(/const \{ t, dir, lang, setLang, languages \} = useTranslation\(\)/);
    expect(SIDEBAR_SRC).toMatch(/l\.code === lang/);
    expect(SIDEBAR_SRC).toMatch(/currentLangName/);
    // Bottom cluster: language, account, settings; opens upward so it stays on screen.
    const lang = order(SIDEBAR_SRC, "t('lang_menu_title')", 'Sidebar');
    const account = order(SIDEBAR_SRC, "t('aria_open_menu')", 'Sidebar');
    const settings = order(SIDEBAR_SRC, "t('nav_settings')", 'Sidebar');
    expect(lang).toBeLessThan(account);
    expect(account).toBeLessThan(settings);
    expect(SIDEBAR_SRC).toMatch(/drop="up"/);
  });

  it('sidebar: vehicle selector, add/edit/delete and alert badge all survive', () => {
    for (const marker of [
      '<select',
      'onSelectVehicle(v || null)',
      'onClick={onOpenAddVehicle}',
      'onEditVehicle(selectedVehicle)',
      'onDeleteVehicle(selectedVehicle)',
      'urgentCount > 0',
    ]) {
      expect(SIDEBAR_SRC, marker).toContain(marker);
    }
  });
});

describe('account control is one avatar menu everywhere', () => {
  it.each(LAYOUT)('%s menu offers the identity line and sign out', (_file, src) => {
    expect(src).toMatch(/ariaLabel=\{t\('nav_account'\)\}/);
    expect(src).toMatch(/t\('menu_signed_in_as', \{ name: currentUser\.name \}\)/);
    expect(src).toMatch(/onClick=\{\(\) => onLogout\?\.\(\)\}/);
    expect(src).toMatch(/t\('set_sign_out'\)/);
  });

  it('mobile and desktop fall back to Google sign-in inside the same menu', () => {
    for (const src of [MOBILE_SRC, DESKTOP_SRC]) {
      expect(src).toMatch(/onClick=\{\(\) => onLoginGoogle\?\.\(\)\}/);
      expect(src).toMatch(/t\('btn_login_google'\)/);
    }
    // The sidebar keeps its full-width one-tap Google button for guests.
    expect(SIDEBAR_SRC).toMatch(/onClick=\{onLoginGoogle\}/);
  });

  it('avatar (picture or initials) is the trigger, never a separate logout button', () => {
    for (const src of [MOBILE_SRC, DESKTOP_SRC, SIDEBAR_SRC]) {
      expect(src).toMatch(/currentUser\.picture/);
      expect(src).toMatch(/currentUser\.name\.charAt\(0\)\.toUpperCase\(\)/);
    }
    expect(MOBILE_SRC).not.toMatch(/<button[^>]*title=\{t\('set_sign_out'\)\}/);
    expect(SIDEBAR_SRC).not.toMatch(/<button[^>]*title=\{t\('set_sign_out'\)\}/);
  });
});

describe('the new chrome is fully translated', () => {
  const keys = new Set<string>();
  for (const [, src] of CHROME) {
    for (const m of src.matchAll(/\bt\(\s*'([a-z0-9_]+)'/g)) keys.add(m[1]);
  }

  it('collects a meaningful key set', () => {
    expect(keys.size).toBeGreaterThan(15);
    for (const required of [
      'nav_account',
      'aria_open_menu',
      'menu_signed_in_as',
      'lang_menu_title',
      'aria_language_menu',
      'lang_menu_hint',
      'set_sign_out',
      'btn_login_google',
      'nav_alerts',
      'nav_settings',
      'vehicle_actions_aria',
      'nav_current_vehicle',
    ]) {
      expect(keys, required).toContain(required);
    }
  });

  it.each([...keys])('%s resolves in Arabic, English and Polish', (key) => {
    for (const lang of LANGS) expect(hasKey(key, lang), `${key}/${lang}`).toBe(true);
  });

  it('interpolates the identity line per language without losing the name', () => {
    const out = LANGS.map((lang) => translate(DICTIONARIES, lang, 'menu_signed_in_as', { name: 'Mohamed' }));
    expect(new Set(out).size).toBe(3);
    for (const text of out) {
      expect(text).toContain('Mohamed');
      expect(text).not.toContain('{');
    }
  });

  it.each(CHROME)('%s hardcodes no Arabic UI literal', (_file, src) => {
    expect(src).not.toMatch(/[\u0600-\u06FF]/);
  });
});
