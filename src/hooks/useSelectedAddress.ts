/**
 * The currently-selected delivery address.
 *
 * Two independent surfaces need this: the home LocationBar (what to show at
 * the top and how to imply "you're setting the service location here") and,
 * shortly, the Cart page (which address the booking is placed against). If
 * either read `addresses[0]` directly the two would diverge the moment the
 * user changed one from the other, so both go through this hook.
 *
 * Persisted in localStorage by id so a page reload doesn't reset the user's
 * choice, and so a new tab picks up the same selection. The fallback is
 * `addresses[0]` — matches the pre-existing default in BookingSheet before
 * this hook existed.
 *
 * Storage of an id (not the full address blob) is deliberate: the
 * authoritative address record lives in the backend and can be edited or
 * deleted from the profile screen. Keeping only the id means the
 * `selected` computed below quietly falls back to `addresses[0]` when the
 * stored id no longer resolves — the alternative (a stale label on a
 * deleted address) is a bug that surfaces at booking time.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAddresses } from "./useApi";
import type { Address } from "@/lib/mock-data";

const STORAGE_KEY = "sc_selected_address_id";

/**
 * The last resolved selected address, mirrored to localStorage (SVC-351).
 *
 * Only the fields the home LocationBar actually paints — label and full. A
 * stale blob is better than a spinner when the device cold-starts offline:
 * React Query's cache lives in memory, so without this the LocationBar reads
 * "Set your location" every airplane-mode launch, which is a worse lie than a
 * day-old locality. The offline banner above it names it as stale.
 *
 * Nothing booking-time reads this cache. The authoritative record is still
 * the backend row keyed by `STORAGE_KEY`, and bookings go through the fresh
 * list — this blob only exists to keep the chrome honest when the fresh list
 * cannot be reached.
 */
const CACHE_KEY = "sc_selected_address_cache";

interface CachedAddress {
  id: string;
  label: string;
  full: string;
}

function readCache(): CachedAddress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as CachedAddress).id === "string" &&
      typeof (parsed as CachedAddress).label === "string" &&
      typeof (parsed as CachedAddress).full === "string"
    ) {
      return parsed as CachedAddress;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(a: CachedAddress | null): void {
  if (typeof window === "undefined") return;
  try {
    if (a === null) localStorage.removeItem(CACHE_KEY);
    else localStorage.setItem(CACHE_KEY, JSON.stringify(a));
  } catch {
    // No localStorage (private mode, quota) — the next online load will
    // repopulate the chrome anyway, so a dropped cache write costs nothing
    // beyond a one-launch regression to "Set your location".
  }
}

/**
 * The last-known selected address, read from localStorage without touching the
 * backend. Exists so a caller rendering the gate's offline branch can show the
 * stale address rather than "Set your location" (SVC-351). Deliberately a
 * plain read, not a hook: callers reach for it only when the fresh fetch has
 * failed, and tying it to React state would race the gate's own fast path.
 */
export function readSelectedAddressCache(): Address | null {
  const blob = readCache();
  if (!blob) return null;
  return {
    id: blob.id,
    label: blob.label,
    full: blob.full,
    lat: null,
    lng: null,
    house_floor: null,
    building: null,
    landmark_area: null,
    pincode: null,
    contact_name: null,
    contact_phone: null,
  };
}

// Simple pub/sub so multiple LocationBars / Cart selectors on the same page
// stay in sync when one calls setSelectedAddressId — otherwise the writer
// updates localStorage but the readers keep their stale in-memory value
// until the next render for unrelated reasons.
const listeners = new Set<() => void>();

/**
 * The id most recently chosen in this session, if any.
 *
 * Exists to tell "this address was deleted" from "this address is too new to
 * be in the cache yet" — see the cleanup effect below. Module-level rather
 * than component state because the write and the check happen in different
 * components: `AddAddressSheet` selects, and the home LocationBar is what
 * re-renders and evaluates the cleanup.
 *
 * Deliberately not persisted. It is only meaningful for as long as a refetch
 * can still be in flight, and forgetting it on reload is what lets a genuinely
 * dangling id be cleaned up on the next load.
 */
let justWritten: string | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// SSR: no localStorage available. Returning null (rather than throwing) lets
// the hook render happily on the server and hydrate to the real value once
// the client mounts.
function getServerSnapshot(): string | null {
  return null;
}

export function useSelectedAddress(): {
  selected: Address | undefined;
  setSelectedId: (id: string) => void;
  addresses: Address[] | undefined;
  isLoading: boolean;
} {
  const { data: addresses, isLoading } = useAddresses();
  const storedId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Resolve the stored id against the freshly-fetched address list. If the
  // saved id points at an address that was since deleted, fall back to the
  // first address instead of showing nothing.
  const selected =
    (storedId ? addresses?.find((a) => a.id === storedId) : undefined) ?? addresses?.[0];

  // Mirror the resolved address to a localStorage cache so an offline cold
  // start has something to paint (SVC-351). React Query's cache is memory-only
  // and the backend address list is the one call the gate blocks on, so
  // without this the LocationBar reads "Set your location" every airplane-mode
  // launch even for someone who had an address five minutes ago.
  useEffect(() => {
    if (!selected) return;
    writeCache({ id: selected.id, label: selected.label, full: selected.full });
  }, [selected]);

  // Clean up an id that no longer resolves. Otherwise the user gets the
  // fallback UI on every load until they manually pick an address.
  //
  // `justWritten` is what keeps this from eating a brand-new selection
  // (SVC-283). Selecting an address the user has only just created means
  // writing an id that the cached list cannot contain yet: `useAddresses` is
  // invalidated, not updated, so there is a window where the refetch has not
  // landed. Without the guard this effect ran against the stale list, decided
  // the id was dangling, and deleted the selection a moment after it was
  // made — which is why saving an address in Kharadi left the header on Karve
  // Nagar. Found on device; the id came back null rather than wrong, which is
  // the tell.
  useEffect(() => {
    if (!storedId || !addresses) return;
    if (addresses.some((a) => a.id === storedId)) return;
    // Written this session and still not in the list: the refetch is in
    // flight, not the address deleted. Leave it alone — if it really is gone,
    // the next load has no memory of the write and cleans it up then.
    if (storedId === justWritten) return;

    try {
      localStorage.removeItem(STORAGE_KEY);
      listeners.forEach((l) => l());
    } catch {
      // No localStorage (private mode, quota exceeded) — nothing to clean.
    }
  }, [storedId, addresses]);

  const setSelectedId = useCallback((id: string) => {
    // Recorded before the write so the cleanup effect, which runs on the
    // notification below, already knows this id is new rather than dangling.
    justWritten = id;
    try {
      localStorage.setItem(STORAGE_KEY, id);
      listeners.forEach((l) => l());
    } catch {
      // Silently no-op in private mode. The picker will still update its
      // in-memory state via React; the choice just won't survive a reload.
    }
  }, []);

  return { selected, setSelectedId, addresses, isLoading };
}
