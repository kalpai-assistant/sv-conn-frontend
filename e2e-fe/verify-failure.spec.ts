/**
 * SVC-473: Razorpay verify-failure must not double-charge.
 *
 * Failure mode caught: Razorpay returns a verify failure after
 * `payment.captured` has already fired on their side; `useBookAndPay`'s
 * try/catch swallows the error correctly today (per useBookAndPay.test.ts)
 * BUT a future refactor that retries the whole `bookAndPay` flow on
 * verify failure would double-charge the user. This spec pins the
 * end-to-end integration: when `/payments/verify` returns a 400, the
 * user lands on tracking with a toast — no fresh booking, no fresh
 * payment order.
 *
 * The companion vitest unit-level coverage of this exact path already
 * exists in `src/hooks/useBookAndPay.test.ts` under "still opens the
 * booking when the money was taken but verify failed". The Playwright
 * version here is the browser-driven regression lock the ticket asks
 * for; the hook test is the fast feedback.
 */
import { expect, test } from "@playwright/test";
import { DEFAULT_SERVICE, DEFAULT_USER, mockBackend } from "./fixtures/backend";
import { stubRazorpay } from "./fixtures/razorpay";
import { seedSession } from "./fixtures/session";

const CART_ITEM = {
  key: `${DEFAULT_SERVICE.id}:${DEFAULT_SERVICE.variants?.[0]?.id ?? ""}`,
  serviceId: DEFAULT_SERVICE.id,
  variantId: DEFAULT_SERVICE.variants?.[0]?.id,
  variantLabel: DEFAULT_SERVICE.variants?.[0]?.label,
  name: DEFAULT_SERVICE.name,
  unitPrice: DEFAULT_SERVICE.price,
  quantity: 1,
  duration: DEFAULT_SERVICE.duration,
};

test("verify-failure does not double-create booking or double-mint payment", async ({ page }) => {
  await seedSession(page.context(), {
    cartItems: [CART_ITEM],
    selectedAddressId: "addr-test-1",
  });
  await stubRazorpay(page, { outcome: "success" });
  const backend = await mockBackend(page, { user: DEFAULT_USER });

  // Override: verify returns 400. Added AFTER mockBackend so it wins the
  // most-recent-first matcher. Since the override fulfills, mockBackend's
  // handler never runs for /payments/verify — track calls on a local
  // counter instead of backend.count().
  let verifyAttempts = 0;
  await page.route("**/api/v1/payments/verify", (route) => {
    verifyAttempts++;
    return route.fulfill({
      status: 400,
      json: { detail: "Signature mismatch", code: "VERIFY_FAILED" },
    });
  });

  await page.goto("/cart");

  // Dismiss the LocationGate (SVC-281, module-scoped per launch).
  await expect(page.getByRole("heading", { name: /Location permission/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /Flat 101, Test Residency/i }).click();

  await expect(page.getByText(DEFAULT_SERVICE.name)).toBeVisible({ timeout: 15_000 });
  const payBtn = page.getByRole("button", { name: /^Book & Pay/i });
  await expect(payBtn).toBeEnabled();
  await payBtn.click();

  // Hook contract: still navigates to tracking even on verify failure
  // (useBookAndPay.ts lines 168-177 — "booking must not be lost"). The
  // toast will tell the user "we couldn't confirm it"; tracking screen
  // shows the real payment status.
  await page.waitForURL(/\/tracking\/booking-test-1/, { timeout: 15_000 });

  // The double-charge guard: exactly ONE booking creation, ONE payment
  // order, ONE verify attempt. Method-scoped because the tracking screen
  // reads /bookings/ (GET) once landed; only POSTs are what count for
  // "did we re-trigger the chain". Real client paths are /bookings/
  // (trailing slash) and /payments/orders (plural).
  expect(backend.count("/bookings/", "POST")).toBe(1);
  expect(backend.count("/payments/orders", "POST")).toBe(1);
  expect(verifyAttempts).toBe(1);
});
