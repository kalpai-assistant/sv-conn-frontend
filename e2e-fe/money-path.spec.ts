/**
 * The money path (SVC-468). Lands at `/cart` with a pre-seeded session so
 * this spec exercises only the chain SVC-259 fixed: tap Pay → mint payment
 * order → open Razorpay → verify → booking rendered as paid.
 *
 * Why not drive the OTP flow here: that chain has its own vitest suite
 * (`src/components/AuthFlow.test.tsx`) + a dedicated Playwright under
 * SVC-472. Doubling it here would couple the money-path assertions to
 * every future auth-flow tweak.
 *
 * Failure mode this would catch: `useBookAndPay` + Razorpay success
 * handler + `/payments/verify` + booking-navigation each pass their unit
 * tests but drift against one another — the SVC-259 shape where the
 * individual pieces work and the chain silently drops the user.
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

test("Book & Pay → Razorpay success → verify → tracking screen", async ({ page }) => {
  // Order matters: seedSession + stubRazorpay BEFORE page.goto so both land
  // via init scripts (they run at document-start).
  await seedSession(page.context(), {
    cartItems: [CART_ITEM],
    selectedAddressId: "addr-test-1",
  });
  await stubRazorpay(page, { outcome: "success" });
  const backend = await mockBackend(page, { user: DEFAULT_USER });

  await page.goto("/cart");

  // The LocationGate (SVC-281) pre-empts every route on first launch. Its
  // "confirmed" flag is module-scoped and resets each launch (see
  // src/lib/location-gate.ts — deliberately NOT localStorage), so Playwright
  // can't bypass it from outside. Tap the saved-location row to confirm;
  // that's exactly what a human user does every cold start.
  //
  // Wait for the gate heading first so we're sure the tap lands on the
  // mounted button (strict mode protects us from the same-name radio in
  // the bottom-sheet variant too).
  await expect(page.getByRole("heading", { name: /Location permission/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /Flat 101, Test Residency/i }).click();

  // Cart row shows the seeded service — renders only after the hydration
  // tick, so `getByText` + a generous timeout handles the initial paint.
  await expect(page.getByText(DEFAULT_SERVICE.name)).toBeVisible({ timeout: 15_000 });

  // Book & Pay sticky footer — label is "Book & Pay · ₹499". Match by prefix.
  const payBtn = page.getByRole("button", { name: /^Book & Pay/i });
  await expect(payBtn).toBeEnabled();
  await payBtn.click();

  // Navigation to tracking is the chain's final step. If this times out
  // the regression almost certainly sits between /payments/orders and
  // /payments/verify — `backend.count()` below narrows which link.
  await page.waitForURL(/\/tracking\/booking-test-1/, { timeout: 15_000 });

  // Call ordering: booking must be created, payment order minted, then
  // verify called. Scope to POST so the tracking screen's GET /bookings/
  // doesn't inflate the count after navigation. If the chain is broken
  // (e.g. verify fires without a preceding order mint), the counts
  // differ and this test regresses the SVC-259 class of integration bug.
  // Real client paths: /bookings/ (trailing slash) and /payments/orders
  // (plural) — see useApi.ts.
  expect(backend.count("/bookings/", "POST")).toBe(1);
  expect(backend.count("/payments/orders", "POST")).toBe(1);
  expect(backend.count("/payments/verify", "POST")).toBe(1);

  // Verify receives the stubbed Razorpay signature — regression against a
  // future refactor that swallows the vendor response before calling verify.
  const verifyBody = backend.bodyAt("/payments/verify", 0) as {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  } | null;
  expect(verifyBody?.razorpay_order_id).toBe("order_test_1");
  expect(verifyBody?.razorpay_payment_id).toMatch(/^pay_/);
  expect(verifyBody?.razorpay_signature).toMatch(/^sig_/);
});
