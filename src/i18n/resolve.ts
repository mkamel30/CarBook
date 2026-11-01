/**
 * Pure i18n resolution logic (no React) shared by the runtime provider in
 * context.tsx and by the vitest suite. Keeping it framework-free makes the
 * fallback chain, interpolation and plural rules directly testable.
 */

export type TranslateVars = Record<string, string | number>;

export type Dictionaries = Record<string, Record<string, string>>;

/** CLDR-style plural category. Arabic uses 0->many, 1->one, 2->two, 3-10->few, 11+->many;
 *  every other language bundled with CarBook (en, pl) resolves to one/other by rule. */
export function pluralCategory(lang: string, n: number): 'one' | 'two' | 'few' | 'many' | 'other' {
  const count = Math.abs(Math.trunc(n));
  if (lang === 'ar') {
    if (count === 1) return 'one';
    if (count === 2) return 'two';
    const mod100 = count % 100;
    if (mod100 >= 3 && mod100 <= 10) return 'few';
    return 'many';
  }
  return count === 1 ? 'one' : 'other';
}

/** Replace `{name}` placeholders. Unknown placeholders are left untouched so
 *  a missing variable never silently erases content. */
export function interpolate(text: string, vars?: TranslateVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/** Same fallback chain the provider has always used: current lang -> en -> ar. */
function lookup(dicts: Dictionaries, lang: string, key: string): string | null {
  const chain = [lang, 'en', 'ar'];
  for (const code of chain) {
    const dict = dicts[code];
    if (dict && dict[key] !== undefined) return dict[key];
  }
  return null;
}

/**
 * Resolve `key` with optional `{placeholder}` interpolation and optional
 * plural variants (`key__one`, `key__two`, `key__few`, `key__many`, `key__other`).
 * When no plural variant exists for the resolved category the base key is used.
 * Returns `fallback` (legacy string second-arg) or the key itself when nothing matches.
 */
export function translate(
  dicts: Dictionaries,
  lang: string,
  key: string,
  second?: string | TranslateVars,
  count?: number,
): string {
  const vars: TranslateVars = typeof second === 'object' && second !== null ? { ...second } : {};
  const fallback = typeof second === 'string' ? second : undefined;
  const resolvedCount =
    count !== undefined ? count : typeof vars.count === 'number' ? vars.count : undefined;

  if (resolvedCount !== undefined) {
    const category = pluralCategory(lang, resolvedCount);
    const variant = lookup(dicts, lang, `${key}__${category}`);
    if (variant !== null) {
      return interpolate(variant, { ...vars, count: resolvedCount });
    }
  }

  const base = lookup(dicts, lang, key);
  if (base !== null) {
    return interpolate(base, resolvedCount !== undefined ? { ...vars, count: resolvedCount } : vars);
  }
  return fallback || key;
}
