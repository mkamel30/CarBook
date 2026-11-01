'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { SUPPORTED_LANGUAGES, DICTIONARIES, LanguageInfo } from './config';
import { translate, TranslateVars } from './resolve';

interface I18nContextType {
  lang: string;
  setLang: (lang: string) => void;
  dir: 'rtl' | 'ltr';
  /**
   * t(key)                      — plain lookup (lang -> en -> ar -> key)
   * t(key, fallback)            — legacy: string returned when the key is missing everywhere
   * t(key, vars)                — {placeholder} interpolation, e.g. t('alerts_overdue_by', { km: 500 })
   * t(key, vars, count)         — plural variant selection (key__one/two/few/many/other) + interpolation
   */
  t: (key: string, vars?: string | TranslateVars, count?: number) => string;
  languages: LanguageInfo[];
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=31536000;SameSite=Lax`;
}

const I18nContext = createContext<I18nContextType>({
  lang: 'ar',
  setLang: () => {},
  dir: 'rtl',
  t: (key: string) => key,
  languages: SUPPORTED_LANGUAGES,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>('ar');

  useEffect(() => {
    // Check saved user language preference in localStorage or cookie
    const savedLocal = typeof window !== 'undefined' ? localStorage.getItem('carbook_lang') : null;
    const savedCookie = getCookie('carbook_lang');
    const saved = savedLocal || savedCookie;
    if (saved && DICTIONARIES[saved]) {
      setLangState(saved);
      document.documentElement.lang = saved;
      const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === saved) || SUPPORTED_LANGUAGES[0];
      document.documentElement.dir = langInfo.dir;
    }
  }, []);

  const currentLangInfo = SUPPORTED_LANGUAGES.find(l => l.code === lang) || SUPPORTED_LANGUAGES[0];
  const dir = currentLangInfo.dir;

  useEffect(() => {
    // Synchronize HTML element attributes
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = dir;
    }
  }, [lang, dir]);

  const setLang = (newLang: string) => {
    if (DICTIONARIES[newLang]) {
      setLangState(newLang);
      try {
        localStorage.setItem('carbook_lang', newLang);
      } catch {}
      setCookie('carbook_lang', newLang);
    }
  };

  const t = (key: string, vars?: string | TranslateVars, count?: number): string =>
    translate(DICTIONARIES, lang, key, vars, count);

  return (
    <I18nContext.Provider value={{ lang, setLang, dir, t, languages: SUPPORTED_LANGUAGES }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}
