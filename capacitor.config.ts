import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS bundle identifier. It can't be changed once the app is on the App Store.
  appId: 'io.github.ss73.nonverbaliq',
  appName: 'Nonverbal IQ',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // Keep the launch screen up until the first screen has rendered (see main.ts), so there is
      // no blank flash while the web view starts.
      launchAutoHide: false,
      launchFadeOutDuration: 250,
    },
  },
  ios: {
    // The page handles safe areas itself (viewport-fit=cover + env(safe-area-inset-*)).
    contentInset: 'never',
  },
};

export default config;
