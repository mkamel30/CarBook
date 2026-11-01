import type { CapacitorConfig } from '@capacitor/cli';

// Production server origin. Override at build/sync time with CARBOOK_SERVER_URL;
// the value below is only the default. This is read when `cap sync`/`cap copy`
// evaluates this config (build time), so it never ships a runtime env lookup.
const SERVER_URL = process.env.CARBOOK_SERVER_URL || 'https://carbook.141.147.136.170.sslip.io';

const config: CapacitorConfig = {
  appId: 'com.mkamel.carbook',
  appName: 'CarBook',
  webDir: 'out',
  server: {
    url: SERVER_URL,
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#090d16',
    // server.url is https and androidScheme is https; no http:// asset is loaded
    // by the served bundle, so mixed content is disabled.
    allowMixedContent: false,
  },
};

export default config;
