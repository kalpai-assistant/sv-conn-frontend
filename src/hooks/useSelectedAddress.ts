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

// Simple pub/sub so multiple LocationBars / Cart selectors on the same page
// stay in sync when one calls setSelectedAddressId — otherwise the writer
// updates localStorage but the readers keep their stale in-memory value
// until the next render for unrelated reasons.
const listeners = new Set<() => void>();

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

  // Clean up an id that no longer resolves. Otherwise the user gets the
  // fallback UI on every load until they manually pick an address.
  useEffect(() => {
    if (storedId && addresses && !addresses.some((a) => a.id === storedId)) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        listeners.forEach((l) => l());
      } catch {
        // No localStorage (private mode, quota exceeded) — nothing to clean.
      }
    }
  }, [storedId, addresses]);

  const setSelectedId = useCallback((id: string) => {
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
