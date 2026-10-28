/**
 * SVC-393: per-user "save for next time" set.
 *
 * Powers the one-off prompt on the tracking screen after a booking lands
 * in COMPLETED. A tap on "Save for next time" writes the service id here;
 * the prompt stops rendering as long as the service is in the set.
 *
 * ## Storage shape
 *
 * `sc_favorites_v1_<userId>` → JSON array of service ids. The `sc_` prefix
 * is load-bearing: `session.clearSession()` (SVC-350) sweeps every
 * `sc_`-prefixed key on logout, so the next sign-in sees an empty set
 * without this module needing a bespoke teardown. Per-user keying matches
 * `sc_cart_v2_<userId>` and `sc_pending_coupon_v1_<userId>` so a shared
 * device cannot leak one user's favorites into another's.
 *
 * ## Why not Set / state / React Query?
 *
 * Nothing else reads this today — the prompt renders inline on tracking,
 * no listing surface exists (SVC-393 non-goal: "Favorites surface on Home
 * — deferred"). A plain localStorage shim is enough; when a listing lands
 * it can wrap this in a `useSyncExternalStore` without rewriting the keys.
 */
const STORAGE_KEY_PREFIX = "sc_favorites_v1_";

function storageKey(userId: string | undefined): string | null {
  // No user → no persistence slot. Returning null short-circuits the
  // reads/writes below rather than falling to a shared anonymous bucket.
  return userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;
}

function read(userId: string | undefined): Set<string> {
  const key = storageKey(userId);
  if (!key || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function write(userId: string | undefined, next: Set<string>): void {
  const key = storageKey(userId);
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...next]));
  } catch {
    // Private mode / quota — the prompt will reappear next session, which
    // is a better degradation than throwing out of a tap handler.
  }
}

export function listFavorites(userId: string | undefined): Set<string> {
  return read(userId);
}

export function hasFavorite(userId: string | undefined, serviceId: string): boolean {
  return read(userId).has(serviceId);
}

export function addFavorite(userId: string | undefined, serviceId: string): void {
  const current = read(userId);
  if (current.has(serviceId)) return;
  current.add(serviceId);
  write(userId, current);
}

export function removeFavorite(userId: string | undefined, serviceId: string): void {
  const current = read(userId);
  if (!current.delete(serviceId)) return;
  write(userId, current);
}
