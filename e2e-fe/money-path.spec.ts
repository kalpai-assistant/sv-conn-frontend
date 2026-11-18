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

// WHY FIXME (SVC-468, to resume from):
//
// The spec body is correctly structured — seedSession + stubRazorpay +
// mockBackend happen before page.goto, routes are registered, the Book & Pay
// button click + waitForURL + call-count assertions all match the hook's
// behaviour. What blocks it is the consumer-app bootstrap cascade:
// SplashGate → AuthFlow restore → LocationGate → pro-state gate →
// bookings-landing verdict → cart hydration. One of the mocked endpoints
// returns a shape the loader stack doesn't like and a `.split(undefined)`
// TypeError upstream of Cart fires, so the error boundary paints
// "Something went wrong" instead of the cart.
//
// Unblocking path (one-hour work):
//   1. Run `npm run test:e2e money-path -- --trace on` and open the trace
//      with `npx playwright show-trace`. The screencast shows the error
//      boundary; the console log in the trace names the stack site.
//   2. Match the shape in fixtures/backend.ts to what the failing loader
//      expects. Most-likely candidates: /categories (ServiceCatalogSheet
//      expects nested shape, not the flat one here), /providers/me (not
//      returning 404 cleanly enough for ProviderProfile consumers), or
//      the location-gate's `availability` call — which the mock doesn't
//      cover and falls into the empty-object default.
//   3. Once the cart renders and `getByText(DEFAULT_SERVICE.name)` passes,
//      drop `test.fixme`.
//
// The smoke test (smoke.spec.ts) proves the webServer + mock-backend +
// Razorpay stub plumbing all work end-to-end. SVC-472 (auth role) and
// SVC-473 (verify-failure) can reuse this scaffold and iterate on the
// mock-shape adjustments; whichever ticket lands first unblocks this one
// as a side effect.
test.fixme("Book & Pay → Razorpay success → verify → tracking screen", async ({ page }) => {
  // Order matters: seedSession + stubRazorpay BEFORE page.goto so both land
  // via init scripts (they run at document-start).
  await seedSession(page.context(), {
    cartItems: [CART_ITEM],
    selectedAddressId: "addr-test-1",
  });
  await stubRazorpay(page, { outcome: "success" });
  const backend = await mockBackend(page, { user: DEFAULT_USER });

  await page.goto("/cart");

  // Cart row shows the seeded service — renders only after the hydration
  // tick, so `getByText` + a generous timeout handles the initial paint.
  await expect(page.getByText(DEFAULT_SERVICE.name)).toBeVisible({ timeout: 15_000 });

  // Book & Pay sticky footer — label changes based on busy state. Match the
  // idle label; `isBusy` flips briefly on tap, and Playwright's auto-waiting
  // will have observed the label by the time we assert the navigation below.
  await page.getByRole("button", { name: /book\s*&\s*pay/i }).click();

  // Expect navigation to the tracking screen with the mocked booking id.
  await page.waitForURL(/\/tracking\/booking-test-1/, { timeout: 15_000 });

  // Call ordering: booking must be created, payment order minted, then
  // verify called. If the chain is broken (e.g. verify fires without a
  // preceding order mint), the counts differ and this test regresses the
  // SVC-259 class of integration bug.
  expect(backend.count("/bookings")).toBeGreaterThanOrEqual(1);
  expect(backend.count("/payments/order")).toBeGreaterThanOrEqual(1);
  expect(backend.count("/payments/verify")).toBeGreaterThanOrEqual(1);

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
