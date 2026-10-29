'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { SUPPORTED_LANGUAGES, DICTIONARIES, LanguageInfo } from './config';

interface I18nContextType {
  lang: string;
  setLang: (lang: string) => void;
  dir: 'rtl' | 'ltr';
  t: (key: string, fallback?: string) => string;
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
  t: (key: string, fallback?: string) => fallback || key,
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

  const t = (key: string, fallback?: string): string => {
    const currentDict = DICTIONARIES[lang];
    if (currentDict && currentDict[key] !== undefined) {
      return currentDict[key];
    }
    // Fallback to English, then Arabic, then fallback parameter, then key name
    const enDict = DICTIONARIES['en'];
    if (enDict && enDict[key] !== undefined) {
      return enDict[key];
    }
    const arDict = DICTIONARIES['ar'];
    if (arDict && arDict[key] !== undefined) {
      return arDict[key];
    }
    return fallback || key;
  };

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
