#!/usr/bin/env node
/**
 * gen-locales.mjs — regenerate src/locales/*.cfg mirrors from the runtime
 * dictionaries in src/i18n/{ar,en,pl}_cfg.ts.
 *
 * Single source of truth: the embedded *_cfg.ts template literals are the
 * runtime truth loaded by src/i18n/config.ts. The .cfg files under
 * src/locales are generated documentation mirrors for translators and must
 * never be edited by hand — run `npm run gen:locales` after changing a
 * dictionary, and the parity test in tests/i18n.test.ts keeps CI honest
 * about drift.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const LANGS = [
  {
    code: 'ar',
    banner: ['# CarBook - Arabic Language Configuration (ar.cfg)', '# اتجاه القراءة من اليمين إلى اليسار (RTL)'],
  },
  {
    code: 'en',
    banner: ['# CarBook - English Language Configuration (en.cfg)', '# Left-to-Right Direction (LTR)'],
  },
  {
    code: 'pl',
    banner: ['# CarBook - Polish Language Configuration (pl.cfg)', '# Kierunek od lewej do prawej (LTR)'],
  },
];

const BAR = '# ====================================================================';

for (const { code, banner } of LANGS) {
  const srcPath = path.join(ROOT, 'src', 'i18n', `${code}_cfg.ts`);
  const source = readFileSync(srcPath, 'utf8');
  const match = source.match(/`([\s\S]*?)`/);
  if (!match) {
    console.error(`gen-locales: no template literal found in ${srcPath}`);
    process.exit(1);
  }
  const body = match[1].replace(/^\r?\n/, '').replace(/\s+$/, '');
  const out = [
    BAR,
    ...banner,
    '# GENERATED FILE — do not edit by hand.',
    `# Source of truth: src/i18n/${code}_cfg.ts (regenerate with: npm run gen:locales)`,
    BAR,
    '',
    body,
    '',
  ].join('\n');
  const outPath = path.join(ROOT, 'src', 'locales', `${code}.cfg`);
  writeFileSync(outPath, out, 'utf8');
  console.log(`gen-locales: wrote src/locales/${code}.cfg`);
}
