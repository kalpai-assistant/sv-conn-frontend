/**
 * Dedicated Vite config for Storybook (SVC-489).
 *
 * The root `vite.config.ts` pulls in TanStack Start SSR + Cloudflare +
 * `vite-plugin-pwa` + Sentry source-map upload — none of which belong in
 * a design-system story build. The PWA plugin's `_generateSW` step in
 * particular fails on the Storybook entry graph.
 *
 * `@storybook/react-vite`'s `framework.options.builder.viteConfigPath`
 * in `.storybook/main.ts` points here instead of the root config, so
 * stories build with only the three plugins that actually matter:
 * React fast-refresh, Tailwind 4, and `vite-tsconfig-paths` so
 * `@/components/*` resolves the same way it does in the app.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
});
