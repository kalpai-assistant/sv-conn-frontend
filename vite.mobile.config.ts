/**
 * Vite config for Capacitor mobile builds (iOS / Android).
 *
 * Key differences from vite.config.ts:
 *  - Uses plain @vitejs/plugin-react (no TanStack Start SSR / Cloudflare plugin)
 *  - SPA mode: outputs a flat index.html in dist-mobile/
 *  - No service worker (PWA) — Capacitor bundles assets natively
 *  - API base URL comes from VITE_API_BASE_URL, read from .env or the shell
 *
 * Usage:
 *   npm run build:mobile                                  # uses .env
 *   VITE_API_BASE_URL=https://api.eazyserv.com/api/v1 npm run build:mobile
 */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";

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

export default defineConfig(({ mode }) => {
  // Vite loads .env files into `import.meta.env` for client code, but never
  // into `process.env`. The `define` below used to read `process.env` alone,
  // so it silently ignored the repo's .env and fell back to the relative
  // default — producing an APK that looked correct and failed on its first
  // request. With `androidScheme: "https"` the WebView resolves a relative
  // `/api/v1` against its own origin and serves index.html back, so every
  // call died on `Unexpected token '<', "<!doctype "... is not valid JSON`
  // with nothing pointing at the real cause.
  //
  // `loadEnv` reads the same .env files the web build does. An explicit shell
  // variable still wins, which keeps CI and the documented
  // `VITE_API_BASE_URL=... npm run build:mobile` invocation working unchanged.
  const fileEnv = loadEnv(mode, process.cwd(), "VITE_");
  const apiBaseUrl = process.env.VITE_API_BASE_URL ?? fileEnv.VITE_API_BASE_URL ?? "/api/v1";

  return {
    plugins: [react(), tailwindcss(), tsconfigPaths(), ...sentryPlugins],

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
      // Inject env at build time so the Capacitor bundle uses an absolute API
      // URL — a relative one cannot work off-device. See the note above.
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl),
      // Tell the app it's running in a Capacitor context
      "import.meta.env.VITE_PLATFORM": JSON.stringify("capacitor"),
    },
  };
});
