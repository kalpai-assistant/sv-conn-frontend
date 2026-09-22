/**
 * The place-name for a pair of coordinates (SVC-281, SVC-284).
 *
 * A provider's service area is stored as a point and a radius — there is no
 * address text anywhere. That left the location gate's row reading "your saved
 * service area", which is a placeholder rather than a place: it is true
 * wherever the provider is standing, so someone who moved from Pune to Mumbai
 * keeps a Pune centre and goes on receiving nothing.
 *
 * The row only works if it can be *disagreed with*. That needs a name, and the
 * only source of one is a reverse geocode — the same call `MapPicker` makes
 * when a pin moves.
 *
 * Uses `reverseGeocode` from the Google Maps client rather than a raw fetch to
 * Nominatim (SVC-284). Google returns structured `address_components`, which
 * is what `localityFromComponents` reads directly — no more parsing a
 * comma-separated string at a fixed index and drawing "Pune" for a Kharadi
 * pin.
 *
 * ## Why this returns a status, not just a string
 *
 * It used to return `string | null`, collapsing three different situations into
 * one value: still resolving, resolved to nothing, and the geocoder failed. The
 * only caller keyed its UI on truthiness, so a Google outage — or a missing API
 * key — looked exactly like "not loaded yet", and it withheld the provider's
 * one-tap row indefinitely (SVC-309).
 *
 * That is the wrong trade. Whether a provider's saved service area is usable
 * has nothing to do with whether a third-party geocoder is reachable, so the
 * caller needs to tell those apart to degrade rather than disappear.
 */
import { useEffect, useState } from "react";
import { reverseGeocode } from "@/lib/google-maps";
import { localityFromComponents } from "@/lib/locality";

export type LocalityState =
  /** No coordinates to resolve, or the lookup is in flight. */
  | { status: "pending"; name: null }
  /** The geocoder answered and named the place. */
  | { status: "named"; name: string }
  /** The geocoder answered but had no locality for this point. */
  | { status: "unnamed"; name: null }
  /** Offline, rate-limited, key missing, or Google rejected the request. */
  | { status: "failed"; name: null };

const PENDING: LocalityState = { status: "pending", name: null };

export function useLocalityAt(lat: number | null, lng: number | null): LocalityState {
  const [state, setState] = useState<LocalityState>(PENDING);

  useEffect(() => {
    if (lat == null || lng == null) {
      setState(PENDING);
      return;
    }
    let cancelled = false;
    // Reset on a coordinate change, so a second lookup never shows the first
    // one's name against the new point.
    setState(PENDING);

    void (async () => {
      try {
        const result = await reverseGeocode(lat, lng);
        if (cancelled) return;
        // "" as the fallback, so nothing useful becomes an empty name rather
        // than a label this hook has no business inventing.
        const named = result ? localityFromComponents(result.components, "") : "";
        setState(named ? { status: "named", name: named } : { status: "unnamed", name: null });
      } catch {
        // Distinguished from "unnamed" deliberately: the caller can keep
        // offering a saved place it already trusts when the failure is ours,
        // and only withhold a name it genuinely does not have.
        if (!cancelled) setState({ status: "failed", name: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return state;
}
