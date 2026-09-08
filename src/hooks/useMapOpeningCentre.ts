/**
 * Where an address map should open (SVC-281).
 *
 * `MapPicker` opens on a hardcoded constant — MG Road, Bangalore. For a user
 * anywhere else that is a map of the wrong city with no explanation: verified
 * on device, a consumer in Pune tapping "Add New Address" lands ~840km away.
 * The only escape is noticing the small locate-me button, and anyone who
 * misses it either scrolls across India or confirms a pin somewhere they have
 * never been.
 *
 * ## The order, and why
 *
 * 1. **Current position, but only if permission is already granted.** Queried
 *    through the Permissions API precisely so that *no prompt fires* — asking
 *    on mount is the thing `LocationBar` deliberately avoids, because a
 *    permission request the user did not initiate has a much lower grant rate,
 *    and on Android a denial is one-shot. This reads existing state; it never
 *    creates a decision point.
 * 2. **The constant**, last — and the caller is told, so the UI can say which
 *    city it is showing instead of pretending it knows.
 *
 * A saved address would be the natural middle step: someone with an address in
 * Pune is far likelier to be adding another one in Pune than in Bangalore. It
 * is not implemented because `AddressResponse` does not return coordinates —
 * `full_address` and a label are all that come back, the same write-only shape
 * the provider service-area had before #156. Adding `lat`/`lng` there is a
 * small backend change and would slot in here as source 2 without touching
 * anything else.
 *
 * Both steps are best-effort. The Permissions API is absent on some Android
 * WebViews and throws on others, and geolocation can time out. Any failure
 * falls through rather than blocking the map from rendering.
 */
import { useEffect, useState } from "react";

/** MapPicker's own fallback. Duplicated deliberately — see `source: "fallback"`. */
const FALLBACK: [number, number] = [12.9716, 77.5946];
const FALLBACK_LABEL = "Bangalore";

/** How long to wait for a fix before giving up and using the next source. */
const POSITION_TIMEOUT_MS = 8_000;

export interface MapOpeningCentre {
  /** Null while still resolving — callers should not mount the map yet. */
  centre: [number, number] | null;
  /** Which source won, so the UI can be honest about a fallback. */
  source: "position" | "fallback" | null;
  /** Human name for the fallback, for copy like "Showing Bangalore". */
  fallbackLabel: string;
}

/**
 * Read the current position **only if permission is already granted**.
 *
 * Returns null rather than prompting. `navigator.permissions` is missing on
 * some Android WebViews and throws on others, so both are treated as "we do
 * not know" — which correctly means "do not ask".
 */
async function positionIfAlreadyAllowed(): Promise<[number, number] | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;

  try {
    const permissions = navigator.permissions;
    if (!permissions?.query) return null;
    const status = await permissions.query({ name: "geolocation" as PermissionName });
    // "prompt" is a no: acting on it would fire the OS dialog unbidden.
    if (status.state !== "granted") return null;
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: POSITION_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}

export function useMapOpeningCentre(): MapOpeningCentre {
  const [resolved, setResolved] = useState<MapOpeningCentre>({
    centre: null,
    source: null,
    fallbackLabel: FALLBACK_LABEL,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const position = await positionIfAlreadyAllowed();
      if (cancelled) return;
      if (position) {
        setResolved({ centre: position, source: "position", fallbackLabel: FALLBACK_LABEL });
        return;
      }

      setResolved({ centre: FALLBACK, source: "fallback", fallbackLabel: FALLBACK_LABEL });
    })();

    return () => {
      cancelled = true;
    };
    // Resolved once per mount: re-running as the address list loads would move
    // the map under a user who has already started dragging the pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return resolved;
}
