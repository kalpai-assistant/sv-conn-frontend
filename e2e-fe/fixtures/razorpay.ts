/**
 * Razorpay vendor stub. Injected via `page.addInitScript` so it runs before
 * the app's main.mobile.tsx and before `useBookAndPay`'s `window.Razorpay`
 * guard runs.
 *
 * The hard rule: no spec in this directory ever hits real Razorpay. Paying
 * real money for a test run is the kind of mistake that doesn't get noticed
 * until the finance team flags a dangling re-authorization a quarter later.
 */
import type { Page } from "@playwright/test";

export interface RazorpayStubOptions {
  /** How the modal resolves. "success" fires `handler`, "dismiss" fires
   *  `modal.ondismiss`. "fail" fires nothing, leaving the UI hung — useful
   *  for SVC-473's verify-failure variant to pair with a mocked /payments/verify. */
  outcome?: "success" | "dismiss" | "fail";
  /** Delay before the outcome fires, in ms (lets the UI render its spinner). */
  delayMs?: number;
}

/**
 * Must be awaited BEFORE page.goto(). Playwright's init-script hook runs at
 * document start, which is when the real Razorpay checkout.js loads too; we
 * overwrite the global immediately after it would have defined itself.
 */
export async function stubRazorpay(page: Page, opts: RazorpayStubOptions = {}): Promise<void> {
  const outcome = opts.outcome ?? "success";
  const delayMs = opts.delayMs ?? 30;

  await page.addInitScript(
    ({ outcome, delayMs }) => {
      type Response = {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      };
      type Options = {
        order_id: string;
        handler?: (r: Response) => void;
        modal?: { ondismiss?: () => void };
      };
      class StubRazorpay {
        private options: Options;
        constructor(options: Options) {
          this.options = options;
        }
        open() {
          setTimeout(() => {
            if (outcome === "success") {
              this.options.handler?.({
                razorpay_order_id: this.options.order_id,
                razorpay_payment_id: `pay_${Math.random().toString(36).slice(2, 10)}`,
                razorpay_signature: `sig_${Math.random().toString(36).slice(2, 10)}`,
              });
            } else if (outcome === "dismiss") {
              this.options.modal?.ondismiss?.();
            }
            // "fail" intentionally does nothing — the modal hangs.
          }, delayMs);
        }
      }
      // `as any` would hide a real-world type drift on the Razorpay side.
      // The spec intentionally shadows the global; a test that cares about
      // the shape should import it from @/types/razorpay.
      (globalThis as unknown as { Razorpay: typeof StubRazorpay }).Razorpay = StubRazorpay;
    },
    { outcome, delayMs },
  );
}
