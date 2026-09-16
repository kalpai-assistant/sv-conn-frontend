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
 * Returns null while resolving and on failure. The caller shows a neutral
 * fallback in that case: a slow or unreachable geocoder must never block a
 * provider from getting into the app, and this screen blocks by design.
 */
import { useEffect, useState } from "react";
import { reverseGeocode } from "@/lib/google-maps";
import { localityFromComponents } from "@/lib/locality";

export function useLocalityAt(lat: number | null, lng: number | null): string | null {
  const [locality, setLocality] = useState<string | null>(null);

  useEffect(() => {
    if (lat == null || lng == null) {
      setLocality(null);
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const result = await reverseGeocode(lat, lng);
        if (cancelled) return;
        // "" as the fallback, so nothing useful becomes null rather than a
        // label this hook has no business inventing.
        const named = result ? localityFromComponents(result.components, "") : "";
        setLocality(named || null);
      } catch {
        // Offline, rate-limited, key missing, or Google rejected. The caller
        // degrades rather than waiting — see the module docs.
        if (!cancelled) setLocality(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return locality;
}
