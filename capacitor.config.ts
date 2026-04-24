import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.swipik.app',
  appName: 'Swypik',
  webDir: 'dist',
  // In dev: use live Vite server instead of bundled build
  server: process.env.CAP_DEV
    ? { url: 'http://YOUR_MACHINE_IP:5299/swipik.html', cleartext: true }
    : undefined,
  plugins: {
    // Filesystem plugin — no extra config needed but declared here for docs
    Filesystem: {},
  },
  android: {
    // Allow http:// cleartext during dev only
    allowMixedContent: !!process.env.CAP_DEV,
    // Use hardware back button to navigate within app
    handleApplicationNotifications: false,
  },
};

export default config;
