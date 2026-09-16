/**
 * The place-name for a pair of coordinates (SVC-281).
 *
 * A provider's service area is stored as a point and a radius — there is no
 * address text anywhere. That left the location gate's row reading "your saved
 * service area", which is a placeholder rather than a place: it is true
 * wherever the provider is standing, so someone who moved from Pune to Mumbai
 * keeps a Pune centre and goes on receiving nothing.
 *
 * The row only works if it can be *disagreed with*. That needs a name, and the
 * only source of one is a reverse geocode — the same Nominatim call
 * `MapPicker` already makes when a pin moves.
 *
 * Returns null while resolving and on failure. The caller shows a neutral
 * fallback in that case: a slow or unreachable geocoder must never block a
 * provider from getting into the app, and this screen blocks by design.
 */
import { useEffect, useState } from "react";
import { localityFrom, localityFromParts } from "@/lib/locality";

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
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        );
        const data = await res.json();
        if (cancelled) return;
        // The structured object first (SVC-284). We already ask for it —
        // `addressdetails=1` above — and used to throw it away, which is how a
        // Kharadi pin came back named "Pune": the string parse counts commas,
        // and Kharadi has one fewer street-level part than Karve Nagar.
        //
        // "" as the fallback on both, so nothing useful from the geocoder
        // becomes null rather than a label this hook has no business inventing.
        const named = localityFromParts(data?.address, "");
        const display = typeof data?.display_name === "string" ? data.display_name : "";
        setLocality(named || (display ? localityFrom(display, "") : "") || null);
      } catch {
        // Offline, rate-limited, or blocked. The caller degrades rather than
        // waiting — see the module docs.
        if (!cancelled) setLocality(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return locality;
}
