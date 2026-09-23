/**
 * Vite config for Capacitor mobile builds (iOS / Android).
 *
 * Key differences from vite.config.ts:
 *  - Uses plain @vitejs/plugin-react (no TanStack Start SSR / Cloudflare plugin)
 *  - SPA mode: outputs a flat index.html in dist-mobile/
 *  - No service worker (PWA) — Capacitor bundles assets natively
 *  - API base URL must be set to your production backend via VITE_API_BASE_URL
 *
 * Usage:
 *   VITE_API_BASE_URL=https://api.svcconnect.in/api/v1 npm run build:mobile
 */
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import fs from "fs";
import path from "path";

/**
 * Strip `firebase-messaging-sw.js` out of the mobile build (SVC-314).
 *
 * `public/firebase-messaging-sw.js` is a legitimate asset for the web PWA —
 * the Firebase SDK registers it by URL there. Vite copies the entire `public/`
 * dir into `dist-mobile/` too, which ships a dormant SW inside the APK at
 * `https://localhost/firebase-messaging-sw.js`. Nothing calls
 * `serviceWorker.register` on native today, but any accidental future call
 * would activate it permanently — the trigger for the SVC-313 white-screen
 * class. Removing the file removes the trigger.
 *
 * `closeBundle` fires after Vite has copied the public dir, so an unlink here
 * is the last step and reliably wins.
 */
function excludeFirebaseMessagingSw(): Plugin {
  return {
    name: "mobile-exclude-firebase-messaging-sw",
    apply: "build",
    closeBundle() {
      const target = path.resolve(__dirname, "dist-mobile", "firebase-messaging-sw.js");
      try {
        fs.unlinkSync(target);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    },
  };
}

// Sentry source-map upload for the Capacitor bundle. Same env-gated pattern
// as vite.config.ts: no-op unless the CI-only env vars are set. Uploaded
// under dist-mobile/ (Capacitor's build output).
const sentryPlugins =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? [
        sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          release: { name: process.env.VITE_SENTRY_RELEASE },
          sourcemaps: { assets: "./dist-mobile/**" },
        }),
      ]
    : [];

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
    excludeFirebaseMessagingSw(),
    ...sentryPlugins,
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  build: {
    outDir: "dist-mobile",
    emptyOutDir: true,
    // Source maps: needed for Sentry's symbolication. The plugin uploads them
    // to Sentry then (in prod) they don't ship to end users' devices — plugin
    // deletes them after upload when `sourcemaps.filesToDeleteAfterUpload` is
    // set. For beta we leave them shipped (small size, easier debugging).
    sourcemap: true,
    rollupOptions: {
      input: "index.mobile.html",
    },
  },

  // SPA: serve index.html for all routes (TanStack Router handles routing client-side)
  // Capacitor wraps the built output — no server needed.
  define: {
    // Inject env at build time so Capacitor bundle uses production API
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(process.env.VITE_API_BASE_URL ?? "/api/v1"),
    // Tell the app it's running in a Capacitor context
    "import.meta.env.VITE_PLATFORM": JSON.stringify("capacitor"),
  },
});
