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
import { SERVER_BASE_URL } from './offline/config';

// Wire the offline seams BEFORE React mounts. The shared page's very first
// action is `fetch('/api/vehicles')` inside a mount effect, so window.fetch must
// already be bridged when rendering begins — hence a synchronous bootstrap here,
// not an effect.
//
// The real network transport is captured ONCE up front and shared: the bridge
// forwards auth/AI through it, and the sync runtime drives /api/sync through it.
// Both must bypass the bridge (which never handles those paths), so nothing may
// read window.fetch after it is patched.
function bootstrap() {
  const originalFetch = window.fetch.bind(window);
  const db = getSharedDatabase();
  const settings = createSettingsStore();

  const bridge = createFetchBridge({
    db,
    settings,
    serverBaseUrl: SERVER_BASE_URL,
    passthroughFetch: originalFetch,
  });
  installFetchBridge(bridge);

  const boot = createSyncBoot({
    db,
    sessionStore: makeWebSessionStore(),
    deviceIdStore: makeWebDeviceIdStore(),
    sinceStore: makeWebSinceStore(),
    baseUrl: SERVER_BASE_URL,
    fetchImpl: originalFetch,
  });
  boot.start();
  return boot;
}

const boot = typeof window !== 'undefined' ? bootstrap() : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App boot={boot} />
  </StrictMode>,
);
