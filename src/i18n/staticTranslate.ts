import { DICTIONARIES } from './config';
import { translate, type TranslateVars } from './resolve';
import { getCurrentLang } from './util';

/**
 * Translate outside the React tree.
 *
 * Module-level helpers (readEnvelope, the toast store) run where no
 * I18nProvider context exists, so they read the persisted UI language the same
 * way the mobile sync boot does and resolve against the same dictionaries.
 */
export function tStatic(key: string, vars?: TranslateVars, count?: number): string {
  return translate(DICTIONARIES, getCurrentLang(), key, vars, count);
}
