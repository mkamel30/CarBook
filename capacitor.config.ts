import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mkamel.carbook',
  appName: 'CarBook',
  webDir: 'out',
  server: {
    url: 'http://carbook.141.147.136.170.sslip.io',
    cleartext: true,
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#090d16',
    allowMixedContent: true,
  },
};

export default config;
