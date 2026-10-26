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
      // JS calls `SplashScreen.hide()` as soon as React mounts (see
      // `initNative` in src/main.mobile.tsx), so this duration is only a
      // ceiling for the "React failed to mount" case. 2s was long enough that
      // a successful boot still visibly held on splash for a beat after the
      // app was interactive; 500ms keeps the native layer on screen just long
      // enough to cover the hand-off from the system splash to the first
      // in-WebView paint without lingering past it.
      launchShowDuration: 500,
      launchAutoHide: true,
      // Brand blue (OKLCH 0.5 0.2 262 → sRGB). Matches the status bar below,
      // the Android system splash background (values/colors.xml → brand_primary
      // referenced from values/styles.xml), the iOS splash image set, and the
      // first-paint HTML skeleton in index.mobile.html — so the whole launch
      // sequence (native splash → fade-out → FOUC window → React mount) reads
      // as one continuous brand surface instead of three colour shifts.
      backgroundColor: "#1957D2",
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
      backgroundColor: "#1957D2",
      overlaysWebView: false,
    },
  },
};

export default config;
