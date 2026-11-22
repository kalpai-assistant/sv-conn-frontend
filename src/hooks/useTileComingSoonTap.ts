/**
 * SVC-419 `marketplace.tile_coming_soon_tapped`: a tap on a service tile (the
 * card or its ADD button) while that tile says "No pros online right now" or
 * "Coming soon".
 *
 * Reads the same state TilePrice paints (the same from-prices query at the
 * same point, through `useTileState`), so the event can't disagree with
 * the label the customer tapped. A priced tile, or one with no data (the
 * catalogue-price fallback), sends nothing.
 *
 * SVC-484's Notify me button sends nothing (Jira 14952 #14): it stops
 * propagation, so its tap never reaches the card's handler. The alert row is
 * the demand signal there.
 *
 * Each tile place calls the returned function from its open handler, and
 * QuickAddButton from its zero-state ADD. ADD stops propagation, so a tap on
 * it never also reaches the card's handler: one event per tap.
 */
import { useCallback } from "react";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { useTileState } from "@/hooks/useTileState";
import { pincodeOrNull, track } from "@/lib/analytics";
import type { Service } from "@/lib/mock-data";

export function useTileComingSoonTap(service: Pick<Service, "id" | "price">): () => void {
  const { state } = useTileState(service);
  const { selected } = useSelectedAddress();
  // The tiles price from the selected address when it has coordinates, else
  // from the device's launch fix: then there is no pincode to send.
  const fromSelected = !!selected && selected.lat != null && selected.lng != null;
  const pincode = fromSelected ? pincodeOrNull(selected) : null;

  return useCallback(() => {
    if (state.kind === "price") return;
    track("marketplace.tile_coming_soon_tapped", {
      service_id: service.id,
      state: state.kind === "offline" ? "no_pros_online" : "coming_soon",
      user_pincode: pincode,
    });
  }, [state.kind, service.id, pincode]);
}
