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
 * Why test.fixme: same consumer-app bootstrap cascade as money-path.spec.ts
 * — SplashGate → AuthFlow restore → LocationGate → pro-state gate →
 * bookings-landing → cart hydration throws before Cart renders. The spec
 * body is correct; it just needs the mock-shape fix documented in
 * money-path.spec.ts to unblock. Once that lands, drop `test.fixme`.
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

test.fixme("verify-failure does not double-create booking or double-mint payment", async ({
  page,
}) => {
  await seedSession(page.context(), {
    cartItems: [CART_ITEM],
    selectedAddressId: "addr-test-1",
  });
  await stubRazorpay(page, { outcome: "success" });
  const backend = await mockBackend(page, { user: DEFAULT_USER });

  // Override: verify returns 400. Added AFTER mockBackend so it wins
  // the most-recent-first matcher.
  await page.route("**/api/v1/payments/verify", (route) =>
    route.fulfill({
      status: 400,
      json: { detail: "Signature mismatch", code: "VERIFY_FAILED" },
    }),
  );

  await page.goto("/cart");
  await expect(page.getByText(DEFAULT_SERVICE.name)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /book\s*&\s*pay/i }).click();

  // Hook contract: still navigates to tracking even on verify failure
  // (useBookAndPay.ts lines 168-177 — "booking must not be lost"). The
  // toast will tell the user "we couldn't confirm it"; tracking screen
  // shows the real payment status.
  await page.waitForURL(/\/tracking\/booking-test-1/, { timeout: 15_000 });

  // The double-charge guard: exactly ONE booking creation, ONE payment
  // order, ONE verify attempt. A refactor that retried the whole chain
  // would show 2+ on bookings/orders here.
  expect(backend.count("/bookings")).toBe(1);
  expect(backend.count("/payments/order")).toBe(1);
  expect(backend.count("/payments/verify")).toBe(1);
});
