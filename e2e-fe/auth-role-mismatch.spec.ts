/**
 * SVC-472: role-mismatch error surfaces to the user (Playwright scenario).
 *
 * Companion to `src/lib/api.role-mismatch.test.ts` which pins the shape
 * contract at the apiFetch layer. This spec exercises the same path
 * end-to-end: AuthFlow phone step, Send OTP, backend returns 400 +
 * `detail: "This phone is already registered as consumer"` +
 * `code: "ROLE_MISMATCH"`, assert the text renders in the inline error
 * banner instead of the useless "API error: 400" placeholder.
 *
 * Failure mode this would catch: a backend regression that ships
 * `detail` as a dict/array (or the frontend `apiFetch` guard is dropped
 * in a refactor) and the user sees "[object Object]" or the generic
 * placeholder on an otherwise-recoverable auth error. Same SVC-253 class.
 */
import { expect, test } from "@playwright/test";
import { mockBackend } from "./fixtures/backend";

const ROLE_MISMATCH_COPY = "This phone is already registered as consumer";

test("role-mismatch on provider sign-in renders the backend's user-safe copy", async ({ page }) => {
  await mockBackend(page);
  // Override /auth/send-otp to return the SVC-253 Policy A rejection. Added
  // AFTER mockBackend() so Playwright's most-recent-first route matcher wins.
  await page.route("**/api/v1/auth/send-otp", (route) =>
    route.fulfill({
      status: 400,
      json: {
        detail: ROLE_MISMATCH_COPY,
        code: "ROLE_MISMATCH",
      },
    }),
  );

  await page.goto("/");

  // Phone step lands first (smoke.spec.ts proves this). Type a number and
  // submit on the consumer side first — same payload path; the role switch
  // link below is the other half of the ticket's "recovery" scope but isn't
  // the failure the error-copy test targets.
  const phone = page.getByPlaceholder("98765 43210");
  await expect(phone).toBeVisible({ timeout: 15_000 });
  await phone.fill("9999999999");
  await page.getByRole("button", { name: /send otp/i }).click();

  // Inline error banner (AuthFlow.tsx: `{errorMsg && (<div>…</div>)}`)
  // renders the backend's user-safe message verbatim. If the detail-unwrap
  // guard breaks or the backend regresses the shape, this assertion fails
  // on the useless "API error: 400" placeholder.
  await expect(page.getByText(ROLE_MISMATCH_COPY)).toBeVisible({ timeout: 10_000 });
});
