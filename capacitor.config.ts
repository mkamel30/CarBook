import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mkamel.carbook',
  appName: 'CarBook',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    backgroundColor: '#090d16',
    allowMixedContent: true,
  },
};

export default config;
