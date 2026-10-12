/**
 * The coupon code a banner tap stashed, to be auto-applied the next time
 * the user lands on `/cart` with a subtotal.
 *
 * Three decisions the design turns:
 *
 * 1. **localStorage, not a context.** The stash outlives the component
 *    that set it — tapping a banner on Home navigates away, and the cart
 *    route mounts fresh. A context would reset on route change. Also
 *    survives the kill-and-reopen a user does mid-funnel ("let me check
 *    my messages, then book") which is a real path for the Diwali deep
 *    cleaning banner's price point.
 * 2. **User-scoped key** (`sc_pending_coupon_v1_<userId>`) — same shape as
 *    `sc_cart_v2_<userId>`. A shared device cannot leak one user's stash
 *    into another's cart; a signed-out user has nothing to stash against
 *    anyway (cart is user-scoped, the sticky row is cart-scoped), so a
 *    `set()` with `undefined` is a quiet no-op rather than an error.
 * 3. **`sc_` prefix** — the one load-bearing choice. `session.ts::clearSession`
 *    (SVC-350) sweeps every `sc_*` key on logout, so the teardown story is
 *    free: a new user never inherits the previous user's stashed code.
 *    Match this prefix on any future user-scoped store or the leak
 *    reappears quietly.
 *
 * Deliberately NOT reactive. The two callers that matter don't need it:
 * banner handlers write-then-navigate (effect fires on arrival), the cart
 * boot-hook reads once on mount. Avoiding a `useSyncExternalStore` or
 * event bus keeps the module shape honest about what it is — a tiny
 * localStorage wrapper, not a state container.
 */

const STORAGE_KEY_PREFIX = "sc_pending_coupon_v1_";

export function pendingCouponKey(userId: string | undefined): string | null {
  // Matches `cart-context.tsx::storageKey`: no user → no stash. The banner
  // handlers are only ever rendered on Home, which requires auth, so hitting
  // this branch means the write races auth hydration — losing the write is
  // the correct outcome (the cart it would later apply against doesn't exist).
  return userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;
}

export function getPendingCoupon(userId: string | undefined): string | null {
  const key = pendingCouponKey(userId);
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function setPendingCoupon(userId: string | undefined, code: string): void {
  const key = pendingCouponKey(userId);
  if (!key || typeof window === "undefined") return;
  // Codes are stored upper-case to match how CouponsSheet renders them and
  // how the backend normalises on validate. Keeps a round-trip through this
  // store from re-casing a hand-typed code the sheet already uppercased.
  const normalised = code.trim().toUpperCase();
  if (!normalised) return;
  try {
    window.localStorage.setItem(key, normalised);
  } catch {
    // Private mode / quota. The caller's navigation still happens; the user
    // just doesn't get the auto-apply on arrival — a less-good UX, not a bug.
  }
}

export function clearPendingCoupon(userId: string | undefined): void {
  const key = pendingCouponKey(userId);
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // See note in `setPendingCoupon`.
  }
}
