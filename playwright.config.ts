/**
 * Frontend Playwright config (SVC-468 / wave-1 G1).
 *
 * Serves the mobile build via `vite dev --config vite.mobile.config.ts`
 * rather than `npm run dev` (vite.config.ts). The latter loads TanStack
 * Start + Cloudflare plugins whose SSR path falls over on Leaflet
 * (`ReferenceError: window is not defined`; see CLAUDE.md "Two things
 * that block browser testing today"). The mobile config is a plain SPA
 * — the same bundle the Capacitor app runs — so the chain Playwright
 * exercises is the chain that ships on-device.
 *
 * The API is mocked in each spec via `page.route()`, so no backend is
 * needed. This matches the admin-console pattern (see admin/playwright.
 * config.ts). The full-chain docker-compose integration is explicitly
 * out of scope for this ticket — a follow-up swaps the mocks for a
 * real backend once we have a captured corpus to point them at.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;

export default defineConfig({
  testDir: "./e2e-fe",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `vite preview --config vite.mobile.config.ts` serves the built mobile
    // SPA from dist-mobile/. The build step runs first; preview without
    // --config loads vite.config.ts (TanStack Start SSR) and 500s on
    // Tailwind's node resolver — the main config isn't preview-compatible.
    //
    // Build cost is ~15s on a warm cache. That beats dev + reloads for
    // a spec run that's fast enough to re-run on save.
    command: `npm run build:mobile && npx vite preview --config vite.mobile.config.ts --port ${PORT} --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Point the client at a relative path. page.route('**/api/v1/**')
    // will match every outgoing fetch regardless of the deployed base.
    env: {
      VITE_API_BASE_URL: "/api/v1",
      // Razorpay key — stubbed anyway; a string here just prevents the
      // "VITE_RAZORPAY_KEY_ID is required" dev-only guard from firing.
      VITE_RAZORPAY_KEY_ID: "rzp_test_playwright",
    },
  },
});
