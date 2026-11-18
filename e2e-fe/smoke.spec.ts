/**
 * Smoke: the mobile SPA bootstraps against the Playwright webServer and
 * `AuthFlow` renders when nothing is stored.
 *
 * Failure mode this would catch: a Vite / TanStack / Capacitor plugin
 * change makes `main.mobile.tsx` throw at module-eval time. All unit
 * tests still pass (jsdom doesn't exercise the bundler path), but the
 * mobile build boots to a white screen. This smoke catches that at CI
 * time before it reaches devices.
 */
import { expect, test } from "@playwright/test";
import { mockBackend } from "./fixtures/backend";

test("app bootstraps and AuthFlow phone step renders for an unauthenticated user", async ({
  page,
}) => {
  await mockBackend(page);
  await page.goto("/");

  // The phone step's placeholder is stable (SVC-253 Policy A: the role is bound
  // for life, so the heading is informational, not the user-facing label).
  await expect(page.getByPlaceholder("98765 43210")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /send otp/i })).toBeVisible();
});
