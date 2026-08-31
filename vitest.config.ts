/**
 * Vitest config — deliberately separate from `vite.config.ts`.
 *
 * The app config wraps Lovable's `defineConfig` and loads the TanStack Start
 * SSR plugin plus `@cloudflare/vite-plugin`. Both want a worker environment and
 * a route-tree codegen pass, neither of which a jsdom component test needs or
 * survives. This config carries only what a test run requires: React transform,
 * the `@/` alias, and jsdom.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Only real test files. `src/**/*` would otherwise sweep in route files
    // whose names contain `.test.` never, but keeping this explicit avoids the
    // codegen'd route tree being collected.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
