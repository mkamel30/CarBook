import { parseCfg } from './parser';

// Default bundled raw .cfg files for instant, offline-first client rendering
import arRaw from './ar_cfg';
import enRaw from './en_cfg';

export interface LanguageInfo {
  code: string;
  name: string;
  dir: 'rtl' | 'ltr';
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'en', name: 'English', dir: 'ltr' },
];

export const DICTIONARIES: Record<string, Record<string, string>> = {
  ar: parseCfg(arRaw),
  en: parseCfg(enRaw),
};
