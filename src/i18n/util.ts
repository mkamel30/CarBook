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

function localeFor(lang: string): string {
  if (lang === 'ar') return 'ar-EG';
  if (lang === 'pl') return 'pl-PL';
  return 'en-GB';
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
