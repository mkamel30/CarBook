import type { CapacitorConfig } from '@capacitor/cli';

// Offline-first shell: the web app is BUNDLED into the APK (webDir = mobile/dist)
// and served from the local https://localhost scheme. There is intentionally NO
// server.url — the app boots from local assets and syncs opportunistically.
//
// The server origin now lives in two places that MUST agree:
//   1. mobile/.env VITE_CARBOOK_SERVER_URL  (baked into the JS bundle at build)
//   2. android/app/src/main/res/values/config.xml <string name="server_url">
//      (used by MainActivity's deep-link auth handoff, which still loads the
//      SERVER url in the WebView to complete a token login — transitional until
//      task #17 replaces it with an in-app bearer bridge).
const config: CapacitorConfig = {
  appId: 'com.mkamel.carbook',
  appName: 'CarBook',
  webDir: 'mobile/dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#090d16',
    // Everything loads from the local https://localhost scheme; no http asset.
    allowMixedContent: false,
  },
};

export default config;
