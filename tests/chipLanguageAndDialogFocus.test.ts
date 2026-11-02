import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DICTIONARIES } from '@/i18n/config';
import { translate } from '@/i18n/resolve';

/**
 * Contract tests for the two Android-only defects in this batch.
 *
 * There is no DOM test environment in this repo (no jsdom / testing-library), so
 * the soft-keyboard and overlay-geometry cases are asserted against the source
 * contract that carries the fix, not against a rendered tree. The language half
 * is behavioural: the keys are resolved through the real dictionaries.
 */
const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const CHIP_SRC = read('mobile/src/components/StatusChip.tsx');
const SYNCBOOT_SRC = read('mobile/src/offline/syncBoot.ts');
const MODAL_SRC = read('src/components/ui/Modal.tsx');

const LANGS = ['ar', 'en', 'pl'] as const;

const hasKey = (key: string, lang: string) =>
  key in DICTIONARIES[lang as (typeof LANGS)[number]] ||
  ['__one', '__two', '__few', '__many', '__other'].some(
    (v) => `${key}${v}` in DICTIONARIES[lang as (typeof LANGS)[number]],
  );

const keysFrom = (src: string, patterns: RegExp[]) => {
  const found = new Set<string>();
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      // Every capture group is a key candidate (the guest/signed-in ternary has two).
      for (const g of m.slice(1)) if (g) found.add(g);
    }
  }
  return [...found];
};

describe('sync status chip is language-reactive', () => {
  // Every label the chip can show: t('...') in the component, label('...') in the
  // sync state machine, and the `key:` literals set by the auth-handoff listener.
  const chipKeys = keysFrom(`${CHIP_SRC}\n${SYNCBOOT_SRC}`, [
    /\bt\('([a-z0-9_]+)'/g,
    /\blabel\('([a-z0-9_]+)'/g,
    /\bkey:\s*'([a-z0-9_]+)'/g,
    /\?\s*'([a-z0-9_]+)'\s*:\s*'([a-z0-9_]+)'/g,
  ]);

  it('collects a non-empty set of chip labels', () => {
    expect(chipKeys.length).toBeGreaterThan(5);
    // The handoff notes are the ones the owner saw hardcoded Arabic in.
    for (const key of ['handoff_login_failed', 'handoff_session_ended', 'handoff_signin_required', 'sync_syncing', 'sync_failed']) {
      expect(chipKeys, key).toContain(key);
    }
  });

  it.each(chipKeys)('resolves %s in Arabic, English and Polish', (key) => {
    for (const lang of LANGS) expect(hasKey(key, lang), `${key}/${lang}`).toBe(true);
  });

  it.each(['sync_syncing', 'sync_failed', 'handoff_session_ended'])(
    'renders %s in the selected language rather than a fixed one',
    (key) => {
      const out = LANGS.map((lang) => translate(DICTIONARIES, lang, key, { n: 3, stage: 'x', reason: 'y' }));
      expect(new Set(out).size, out.join(' | ')).toBe(3);
      for (const text of out) expect(text).not.toBe('');
    }
  );

  it('no longer carries a hardcoded Arabic literal in the component', () => {
    expect(CHIP_SRC).not.toMatch(/فشل|انتهت|جارٍ|المزامنة|تسجيل الدخول/);
  });
});

describe('sync status chip sits below the interactive header row', () => {
  // `calc(6.5rem + env(safe-area-inset-top))` — nested parens, so take the
  // declared value as a whole rather than trying to trim the calc().
  const topOffset = CHIP_SRC.match(/top:\s*'([^']+)'/)?.[1] ?? '';

  it('anchors past the sticky top bar and the pill row instead of on them', () => {
    const rem = Number(topOffset.match(/([\d.]+)rem/)?.[1] ?? '0');
    // 0.5rem used to land the chip on top of the header buttons.
    expect(rem).toBeGreaterThanOrEqual(6);
  });

  it('still respects the notch inset', () => {
    expect(topOffset).toContain('env(safe-area-inset-top)');
  });
});

describe('dialog behaviour keeps focus while typing', () => {
  const hookBody = MODAL_SRC.slice(MODAL_SRC.indexOf('export function useDialogBehaviour'));
  const effectDeps = hookBody.match(/\},\s*\[([^\]]*)\]\);/)?.[1] ?? '';

  it('does not re-bind the focus effect on every parent render', () => {
    // Callers pass inline arrows, so `onClose` in the dep array re-ran the effect
    // (and its previouslyFocused.restore) on each keystroke, dismissing the
    // Android soft keyboard after one character.
    expect(effectDeps).not.toContain('onClose');
    expect(effectDeps).toContain('open');
  });

  it('reads the latest onClose through a ref instead of closing over it', () => {
    expect(hookBody).toMatch(/const onCloseRef = useRef\(onClose\);/);
    expect(hookBody).toMatch(/onCloseRef\.current = onClose;/);
    expect(hookBody).toMatch(/onCloseRef\.current\(\)/);
  });
});
