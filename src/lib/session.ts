/**
 * Wipe every user-scoped client cache (SVC-350).
 *
 * On logout — and belt-and-braces, on the post-OTP success path before setting
 * a new user — the previous user's in-memory React Query cache (`/users/me`,
 * `/bookings`, `/addresses`, `/coupons/available`, …) and any `sc_`-prefixed
 * `localStorage` key must be gone. Without this, a shared device shows user A
 * data under user B for however long each cache lives: TTL for React Query,
 * forever for a non-user-scoped key like `sc_selected_address_id`. That is a
 * DPDP-adjacent PII leak — booking lists carry the customer's address and
 * phone number.
 *
 * ## What this clears
 *
 * - React Query cache + mutations — `queryClient.clear()`.
 * - Every `localStorage` key beginning with `sc_`:
 *   - `sc_cart_v2_<userId>` — per-user cart (keyed by user, but we clear
 *     anyway so a user who re-logs doesn't see their own abandoned cart
 *     silently reappear a reload later).
 *   - `sc_selected_address_id` — the one key that is NOT user-scoped and
 *     is the clearest leak vector. Would otherwise point at user A's
 *     deleted address id, which `useSelectedAddress` would then clean up
 *     for user B — but only after the stale fallback flashed.
 *   - Any future `sc_` key gets this for free. The whole point of this
 *     helper is that a new user-scoped store needs no bespoke teardown.
 *
 * ## What this does NOT clear (non-goals, see SVC-350)
 *
 * - `eazyserv:user` and the auth tokens: the caller (`auth-context`'s
 *   `logout`) owns those, alongside the rest of its auth-state teardown.
 * - Service-worker cache: only static assets, no API responses.
 * - Native Capacitor plugin storage: no user data lives there today.
 * - Last-logged-in-user hint on the sign-in screen: deferred (adds
 *   friction, out of scope).
 *
 * ## Order of operations
 *
 * Synchronous and idempotent. The caller MUST call this BEFORE any navigation
 * so the destination route cannot refetch mid-logout and re-populate the cache
 * with the signed-out user's data — the exact race this ticket exists to fix.
 *
 * `queryClient.clear()` is already idempotent, and the `localStorage` sweep is
 * read-then-delete, so a StrictMode double-invocation is safe.
 */
import type { QueryClient } from "@tanstack/react-query";

const USER_SCOPED_KEY_PREFIX = "sc_";

export function clearSession(queryClient: QueryClient): void {
  queryClient.clear();

  if (typeof window === "undefined") return;
  try {
    // Collect first, then delete. Removing during iteration shifts indices
    // under `localStorage.key(i)` and silently skips keys — the kind of thing
    // that leaves one stale blob behind and makes "it mostly works" worse than
    // a loud failure, because the leak is intermittent and user-dependent.
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(USER_SCOPED_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Private mode / quota. The in-memory React Query clear already landed; a
    // storage write failing here isn't worth throwing out of a logout path.
  }
}
