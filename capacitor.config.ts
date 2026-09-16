import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Must be a unique reverse-domain identifier — update before App Store submission
  appId: "com.eazyserv.app",
  appName: "EazyServ",

  // Points to the Capacitor-specific build output
  webDir: "dist-mobile",

  server: {
    // Use https scheme on Android to avoid mixed-content issues with fetch
    androidScheme: "https",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#011346",
      showSpinner: false,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
    },
    StatusBar: {
      style: "Light",
      // Brand blue, matching what `initNative` sets at runtime
      // (src/main.mobile.tsx) and what every other surface shows — the Android
      // PWA, Android Chrome and iOS Safari all read `theme-color`, and the iOS
      // PWA gets it from `.safe-top` (SVC-285).
      //
      // This said `#011346` until that ticket, which was dead config: the
      // runtime call overrides it on every launch, so the app rendered blue
      // while the file claimed navy — long enough to send one investigation
      // down the wrong path. The splash colour below is genuinely navy and
      // stays.
      backgroundColor: "#1957D2",
      overlaysWebView: false,
    },
  },
};

export default config;
