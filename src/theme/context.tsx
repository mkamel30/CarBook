'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export interface ThemeInfo {
  code: string;
  /** Native name shown in the picker. */
  name: string;
  /** Short description of the look. */
  description: string;
  /** Preview swatches: [background, surface, accent]. */
  preview: [string, string, string];
}

export const THEMES: ThemeInfo[] = [
  {
    code: 'material',
    name: 'Material 3 Expressive',
    description: 'Tonal dark surfaces with an amber accent (default).',
    preview: ['#0F172A', '#141C2E', '#F59E0B'],
  },
  {
    code: 'glass',
    name: 'Glassmorphism',
    description: 'Frosted, blurred panels over a cyan/violet gradient.',
    preview: ['#141A2E', '#1A2140', '#22D3EE'],
  },
  {
    code: 'light',
    name: 'Light Minimal',
    description: 'Bright white cards with dark text for daylight use.',
    preview: ['#EEF2F7', '#FFFFFF', '#D97706'],
  },
  {
    code: 'terminal',
    name: 'Terminal / Monospace',
    description: 'GitHub-dark green phosphor, hard edges, mono type.',
    preview: ['#0D1117', '#161B22', '#3FB950'],
  },
];

const DEFAULT_THEME = 'material';

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => void;
  themes: ThemeInfo[];
}

function isValid(theme: string | null): theme is string {
  return !!theme && THEMES.some((t) => t.code === theme);
}

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  themes: THEMES,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<string>(DEFAULT_THEME);

  useEffect(() => {
    const saved = localStorage.getItem('carbook_theme');
    if (isValid(saved)) setThemeState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = (newTheme: string) => {
    if (!isValid(newTheme)) return;
    setThemeState(newTheme);
    try {
      localStorage.setItem('carbook_theme', newTheme);
    } catch {}
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
