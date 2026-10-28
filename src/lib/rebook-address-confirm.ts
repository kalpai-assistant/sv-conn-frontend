/**
 * SVC-393: scratchpad for the "address fell back during rebook" signal.
 *
 * `prepareRebook` returns `address.fellBack = true` when the historical
 * delivery address was deleted and we substituted the user's default. The
 * cart renders a sticky "please confirm" row on top of its selector in
 * response. The signal has to survive a route change (bookings → cart)
 * but not a reload, so it lives in sessionStorage keyed by user id.
 *
 * Mirrors the shape of `sc_pending_coupon_v1_<userId>` from SVC-347. One
 * value: the deleted address's label (or an empty string if we did not
 * know it). The sticky row renders only while a value is present; "Looks
 * good" / changing the address clears it.
 *
 * `sc_` prefix is still load-bearing even though this is sessionStorage —
 * `clearSession()` (SVC-350) only sweeps localStorage, but the prefix is
 * the project's agreed-upon marker for client-scoped state and the next
 * developer will expect to find it here if they need to add a listener.
 */
const STORAGE_KEY_PREFIX = "sc_rebook_addr_confirm_v1_";

function storageKey(userId: string | undefined): string | null {
  // Session-scoped is intentional: a reload with no cart underneath means
  // the user navigated away before confirming, and asking again on empty
  // cart would be noise. Per-user keying matches the cart's own slot.
  return userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;
}

export function setRebookAddressConfirm(userId: string | undefined, previousLabel: string): void {
  const key = storageKey(userId);
  if (!key || typeof window === "undefined") return;
  try {
    // Store the label (even if empty) so the sticky row can name the
    // address that got dropped. The empty string is a legitimate value:
    // the historical booking's address blob may carry no label when the
    // backend has already anonymised it.
    window.sessionStorage.setItem(key, previousLabel);
  } catch {
    // Private mode / quota — the sticky row simply won't appear. The
    // address will still be the fallback default, so the user is not
    // being surprise-charged against a wrong location.
  }
}

export function getRebookAddressConfirm(userId: string | undefined): string | null {
  const key = storageKey(userId);
  if (!key || typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function clearRebookAddressConfirm(userId: string | undefined): void {
  const key = storageKey(userId);
  if (!key || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}
