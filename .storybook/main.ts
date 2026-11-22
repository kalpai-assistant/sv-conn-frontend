/**
 * Storybook configuration — SVC-489 (Phase 0 of SVC-378).
 *
 * Local-only, no Chromatic (contract §6 — no new paid services). The purpose
 * is a design-system eyeball surface: isolated component development, dark-
 * mode toggling via the toolbar, and a reusable reference for the next
 * feel-upgrade wave rather than reaching for the running app.
 *
 * `viteConfigPath` below points at a Storybook-local `vite.config.ts` so
 * the root config (TanStack Start SSR + Cloudflare + `vite-plugin-pwa` +
 * Sentry) is NOT inherited — those plugins break a story build (the PWA
 * plugin's `_generateSW` in particular fails on the Storybook entry graph).
 */
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: {
        viteConfigPath: ".storybook/vite.config.ts",
      },
    },
  },
  // Minimal addon footprint for Phase 0 — the built-in Vite + Tailwind
  // pipeline covers rendering; controls/actions/viewport addons can land in
  // a follow-up ticket if an eyeball pass demands them.
  addons: [],
  docs: { defaultName: "Docs" },
};

export default config;
