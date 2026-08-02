import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Must be a unique reverse-domain identifier — update before App Store submission
  appId: "com.eazyserv.app",
  appName: "Eazyserv",

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
      backgroundColor: "#7C3AED",
      showSpinner: false,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
    },
    StatusBar: {
      style: "Light",
      backgroundColor: "#7C3AED",
      overlaysWebView: false,
    },
  },
};

export default config;
