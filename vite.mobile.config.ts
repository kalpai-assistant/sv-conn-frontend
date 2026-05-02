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
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  build: {
    outDir: "dist-mobile",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.mobile.html",
    },
  },

  // SPA: serve index.html for all routes (TanStack Router handles routing client-side)
  // Capacitor wraps the built output — no server needed.
  define: {
    // Inject env at build time so Capacitor bundle uses production API
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(
      process.env.VITE_API_BASE_URL ?? "/api/v1",
    ),
    // Tell the app it's running in a Capacitor context
    "import.meta.env.VITE_PLATFORM": JSON.stringify("capacitor"),
  },
});
