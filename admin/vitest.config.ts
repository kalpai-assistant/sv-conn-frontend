/**
 * Vitest config — separate from `vite.config.ts` for the same reason as the
 * consumer app's: a test run needs only the React transform, the `@/` alias
 * and jsdom. The router plugin is left out so tests never rewrite
 * src/routeTree.gen.ts; they use the committed one.
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
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
