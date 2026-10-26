/**
 * Which payment method the user last used (SVC-385, smart defaults).
 *
 * `/cart` boots with "Pay online" selected because that is what the business
 * wants, but someone who has paid cash on four jobs in a row is now re-tapping
 * Cash every time — small cost per booking, compounding across the user's
 * entire relationship with the app. This helper is a one-field memory: on
 * successful booking, write what they chose; on next cart open, surface it as
 * the default toggle.
 *
 * ## Why only the method and not a Razorpay token
 *
 * The ticket calls for storing a *safe identifier* (card last-4 or UPI VPA
 * display) and NEVER the raw token. Our current Razorpay checkout response
 * (`src/types/razorpay.d.ts`) exposes only `razorpay_order_id`,
 * `razorpay_payment_id`, and `razorpay_signature` — none of which qualify as
 * a safe display identifier (all three are server-opaque tokens tied to the
 * payment and getting leaked between users would be a real incident). Until
 * the Standard Checkout response is widened to include `method` + the
 * matching safe tail (SVC-385 follow-up), the honest memory is the
 * online-vs-cash preference itself. One field, no tokens, trivial to extend
 * later: add a sibling helper for "safe details" when the data is available.
 *
 * ## Why `sc_` prefix
 *
 * `session.ts::clearSession` (SVC-350) sweeps every `sc_*` key on logout; the
 * key MUST use the prefix or the memory survives logout/login and leaks the
 * previous user's preference into a shared device.
 */
const STORAGE_KEY = "sc_last_payment_method";

export type PaymentMethodMemo = "online" | "cash";

function isValid(v: unknown): v is PaymentMethodMemo {
  return v === "online" || v === "cash";
}

export function readLastPaymentMethod(): PaymentMethodMemo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isValid(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeLastPaymentMethod(method: PaymentMethodMemo): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, method);
  } catch {
    // Private mode or quota. The in-memory toggle already updated; a dropped
    // persist costs one future cart reset to the business-preferred default,
    // not a user-visible failure.
  }
}
