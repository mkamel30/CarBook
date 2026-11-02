/**
 * Small framework-free i18n helpers shared by the layout chrome.
 * Kept out of context.tsx so they are unit-testable without React.
 */

const LANGUAGE_CYCLE = ['ar', 'en', 'pl'] as const;

/** Cycle used by the DesktopHeader / MobileTopBar language switcher. */
export function nextLang(lang: string): string {
  const index = LANGUAGE_CYCLE.indexOf(lang as (typeof LANGUAGE_CYCLE)[number]);
  if (index === -1) return LANGUAGE_CYCLE[0];
  return LANGUAGE_CYCLE[(index + 1) % LANGUAGE_CYCLE.length];
}

/** Intl locale tag for a language code. */
export function localeFor(lang: string): string {
  if (lang === 'ar') return 'ar-EG';
  if (lang === 'pl') return 'pl-PL';
  return 'en-GB';
}

/** Text direction for a language code (mirrors SUPPORTED_LANGUAGES in config.ts). */
export function dirFor(lang: string): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Active language outside of React.
 *
 * The I18nProvider persists every choice to localStorage 'carbook_lang' (and a
 * cookie), so non-React modules — the sync boot wrapper, the export services —
 * resolve the same value the UI is rendering with. Falls back to 'ar', the
 * product default, when no storage is available.
 */
export function getCurrentLang(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('carbook_lang');
      if (saved === 'ar' || saved === 'en' || saved === 'pl') return saved;
    }
  } catch {
    // Storage can throw in private-mode WebViews; the default below still works.
  }
  return 'ar';
}

/**
 * Read one side of a bilingual (Arabic/English) content pair stored on a row —
 * schedule titles, OEM spec twins — in the active language, falling back to the
 * other side when a row predates the second column so a record never renders
 * blank. Polish has no third column of its own: like every other bilingual
 * label in the app, it reads the English side.
 */
export function localizedField(
  lang: string,
  ar: string | null | undefined,
  en: string | null | undefined,
): string {
  return (lang === 'ar' ? ar || en : en || ar) || '';
}

/**
 * Format an ISO `YYYY-MM-DD` (or ISO datetime) string for display in the
 * active language. Dates are parsed into local-time components so a plain
 * calendar date never shifts by a day in negative timezones.
 */
export function formatDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(localeFor(lang), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return iso;
  }
}
