// The Tailwind pipeline entry for the shell: import the ROOT globals.css
// verbatim (it carries the @tailwind directives AND the theme custom
// properties the shared components depend on). Zero copy — the two surfaces
// can never drift. mobile/tailwind.config.cjs scans ../src + ./src for classes.
import '../../src/app/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getSharedDatabase } from './offline/db';
import { createSettingsStore } from './offline/settingsStore';
import { createFetchBridge, installFetchBridge } from './offline/fetchBridge';
import {
  createSyncBoot,
  makeWebSessionStore,
  makeWebDeviceIdStore,
  makeWebSinceStore,
} from './offline/syncBoot';
import {
  createBearerFetch,
  runAccountHandoff,
  type AccountBearer,
  type BearerStore,
} from './offline/authBridge';
import { SERVER_BASE_URL } from './offline/config';

// Account session bearer (the durable 7-day JWT redeemed from the OAuth
// handoff code). localStorage today; keystore migration is tracked in
// authBridge.ts (TODO #17 follow-up).
const BEARER_KEY = 'carbook_account_bearer';

function makeWebBearerStore(): BearerStore {
  const available = () => typeof localStorage !== 'undefined';
  return {
    async load() {
      if (!available()) return null;
      try {
        return JSON.parse(localStorage.getItem(BEARER_KEY) || 'null') as AccountBearer | null;
      } catch {
        return null;
      }
    },
    async save(bearer) {
      if (available()) localStorage.setItem(BEARER_KEY, JSON.stringify(bearer));
    },
    async clear() {
      if (available()) localStorage.removeItem(BEARER_KEY);
    },
  };
}

/** Single channel the status chip listens on for auth outcomes. */
function noteHandoff(detail: unknown): void {
  window.dispatchEvent(new CustomEvent('carbook:handoff', { detail }));
}

// Wire the offline seams BEFORE React mounts. The shared page's very first
// action is `fetch('/api/vehicles')` inside a mount effect, so window.fetch must
// already be bridged when rendering begins — hence a synchronous bootstrap here,
// not an effect.
//
// The real network transport is captured ONCE up front and wrapped with the
// account bearer: the bridge forwards auth/AI through it, and the sync runtime
// drives /api/sync through it. Calls that set their own Authorization (device
// session) are never overwritten by the bearer wrapper.
function bootstrap() {
  const originalFetch = window.fetch.bind(window);
  const db = getSharedDatabase();
  const settings = createSettingsStore();
  const bearerStore = makeWebBearerStore();

  const networkFetch = createBearerFetch(originalFetch, {
    store: bearerStore,
    serverBaseUrl: SERVER_BASE_URL,
    onUnauthorized: (reason) => noteHandoff({ kind: 'unauthorized', reason }),
  });

  const bridge = createFetchBridge({
    db,
    settings,
    serverBaseUrl: SERVER_BASE_URL,
    passthroughFetch: networkFetch,
  });
  installFetchBridge(bridge);

  const boot = createSyncBoot({
    db,
    sessionStore: makeWebSessionStore(),
    deviceIdStore: makeWebDeviceIdStore(),
    sinceStore: makeWebSinceStore(),
    baseUrl: SERVER_BASE_URL,
    fetchImpl: networkFetch,
  });
  return { boot, bearerStore, originalFetch };
}

const shell = typeof window !== 'undefined' ? bootstrap() : null;

let bearerStoreClear: () => Promise<void> = async () => {};
if (typeof localStorage !== 'undefined') {
  bearerStoreClear = async () => localStorage.removeItem(BEARER_KEY);
}

if (shell) {
  // Login entry point for the shared UI. A main-frame navigation away from the
  // local https://localhost origin is handed to the external browser by
  // Capacitor (launchIntent), which is exactly what Google OAuth requires —
  // the WebView itself must never embed accounts.google.com.
  (window as unknown as { carbookShell?: unknown }).carbookShell = {
    openLogin: () => {
      if (!SERVER_BASE_URL) return;
      window.location.href = `${SERVER_BASE_URL.replace(/\/$/, '')}/api/auth/login?source=app`;
    },
    clearSession: () => {
      void bearerStoreClear();
    },
  };
}

// Boot order: redeem the deep-link handoff FIRST (a code is single-use and the
// link step rewinds the sync cursor), then start the opportunistic sync loop.
// With no code and no stored bearer this resolves immediately, so the guest
// path never waits on the network.
async function startWithHandoff(): Promise<void> {
  if (!shell) return;
  const { boot, bearerStore, originalFetch } = shell;
  const sinceStore = makeWebSinceStore();
  const search = window.location.search;
  try {
    const outcome = await runAccountHandoff({
      search,
      baseUrl: SERVER_BASE_URL,
      bearerStore,
      sessionStore: makeWebSessionStore(),
      deviceIdStore: makeWebDeviceIdStore(),
      fetchImpl: originalFetch,
      onLinked: async () => {
        // The server just re-owned this device's guest rows: rewind the cursor
        // and re-pull so the claimed rows come back down onto the device.
        sinceStore.save(0);
        await boot.syncNow().catch(() => {});
      },
    });
    if (outcome.kind === 'failed') noteHandoff(outcome);
    else if (outcome.kind === 'linked' || outcome.kind === 'restored') {
      // The mounted UI already asked /api/auth/me before the bearer existed;
      // tell it to ask again so the signed-in state appears without a reload.
      noteHandoff({ kind: 'signedin' });
    }
  } finally {
    // Never leave a redeemable code in the address bar: a reload would replay
    // a single-use code and surface a bogus "login failed".
    if (search) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
  boot.start();
}

if (shell) void startWithHandoff();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App boot={shell?.boot ?? null} />
  </StrictMode>,
);
