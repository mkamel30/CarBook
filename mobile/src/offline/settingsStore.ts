// Local-only settings store for the offline bridge.
//
// The server keeps app_settings per user in SQL; the device has no settings
// table in its sync schema, and settings are intentionally device-local (they
// carry BYOK preferences and fuel-type pricing, not synced records). So this
// keeps a single JSON snapshot in localStorage (browser/WebView) or in memory
// (Node tests), seeded from the same official country preset the server uses so
// the two never drift.

import { getFuelPresetsByCountry } from '@app/services/geoPricing';

export interface LocalSettings {
  provider: string;
  apiKey: string | null;
  fuelTypes: unknown[];
}

export interface SettingsStore {
  load(): LocalSettings;
  save(patch: Partial<LocalSettings>): LocalSettings;
}

const STORAGE_KEY = 'carbook_offline_settings';

function defaults(): LocalSettings {
  return {
    provider: 'gemini',
    apiKey: null,
    fuelTypes: getFuelPresetsByCountry('EG').fuelTypes,
  };
}

function clone(s: LocalSettings): LocalSettings {
  return { ...s, fuelTypes: [...s.fuelTypes] };
}

/** In-memory store: the default under Node/vitest where there is no window. */
export function makeMemorySettingsStore(seed?: Partial<LocalSettings>): SettingsStore {
  let state: LocalSettings = { ...defaults(), ...seed };
  return {
    load: () => clone(state),
    save: (patch) => {
      state = { ...state, ...patch };
      return clone(state);
    },
  };
}

/** localStorage-backed store: used in the WebView so settings survive restarts. */
export function makeLocalStorageSettingsStore(storage: Storage): SettingsStore {
  function read(): LocalSettings {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      return { ...defaults(), ...JSON.parse(raw) };
    } catch {
      return defaults();
    }
  }
  return {
    load: () => clone(read()),
    save: (patch) => {
      const next = { ...read(), ...patch };
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage full / unavailable — the in-run snapshot still holds */
      }
      return clone(next);
    },
  };
}

/** Pick the platform default store without importing Capacitor. */
export function createSettingsStore(): SettingsStore {
  if (typeof localStorage !== 'undefined') {
    try {
      return makeLocalStorageSettingsStore(localStorage);
    } catch {
      /* fall through to memory */
    }
  }
  return makeMemorySettingsStore();
}

/** The GET /api/settings response body — mirrors the server's field set. */
export function settingsResponseData(s: LocalSettings) {
  return {
    provider: s.provider,
    hasApiKey: Boolean(s.apiKey),
    maskedApiKey: s.apiKey ? `${s.apiKey.slice(0, 4)}...${s.apiKey.slice(-4)}` : null,
    isServerManaged: false,
    hasServerKey: false,
    isAiReady: true,
    fuelTypes: s.fuelTypes,
  };
}
