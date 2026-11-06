/**
 * Runs against the dev server rather than a build: main.tsx mounts under
 * StrictMode, and only a dev build runs effects twice. The "/totp/setup is
 * called exactly once" check would pass for nothing against a production bundle.
 *
 * The API is mocked in the spec (page.route), so no backend is needed.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 5174;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // Beats a local .env pointing at a real backend: the mocks match this path.
    env: { VITE_API_BASE_URL: "/api/v1" },
  },
});
