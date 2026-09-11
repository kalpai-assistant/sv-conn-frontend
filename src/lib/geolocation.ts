/**
 * One way to ask where the user is (SVC-281).
 *
 * ## Why this exists rather than calling `navigator.geolocation` directly
 *
 * On native, the web geolocation API is the wrong tool, and using it cost four
 * attempts at the launch gate before that became clear:
 *
 * - `navigator.permissions.query({name:"geolocation"})` reported `"prompt"` on
 *   a device where Android had granted ACCESS_FINE_LOCATION and a real call
 *   returned a fix in 81ms. The WebView's own geolocation grant is separate
 *   from the app's, and is only ever established by `getCurrentPosition`
 *   itself — so the query described a permission its own caller creates.
 * - Failures are indistinguishable. Location switched off and permission
 *   refused both arrive as a timeout or a generic error, so the gate could not
 *   reliably say which of the two to fix.
 * - Timing is unusable. The same device, location on throughout, answered
 *   consecutive cold-start calls in 1ms, 43ms, 836ms and 8256ms, and sometimes
 *   failed outright while the service was still starting.
 *
 * `@capacitor/geolocation` fixes all three: `checkPermissions()` reports the
 * app's real permission, and errors carry distinct codes — `LOCATION_DISABLED`
 * for the OS toggle, `LOCATION_PERMISSIONS_DENIED` for the permission. It also
 * runs Play Services' location-settings check, which is what raises the
 * "turn on Location" dialog that Urban Company shows.
 *
 * ## Web still matters
 *
 * The app also ships as a PWA, where the plugin falls back to the same web API.
 * That is fine — the failure modes above are native-specific, and on web the
 * browser's own permission model is the one the user expects.
 */
import { Capacitor } from "@capacitor/core";

/** Why a location request failed, in terms the gate's copy can act on. */
export type LocationFailure =
  /** The OS location toggle is off. Only the device settings fix this. */
  | "location-disabled"
  /** The app was refused permission. On Android it cannot ask again. */
  | "permission-denied"
  /** Asked for and not granted yet, or dismissed. Asking again is allowed. */
  | "permission-prompt"
  /**
   * No answer in time — nothing was refused and nothing is switched off, the
   * GPS was simply still warming up.
   *
   * Its own case because it is not evidence of anything. Straight after a cold
   * start the same device answered in 130ms and, on the next launch, not
   * within ten seconds; treating that as "cannot locate" gated a user whose
   * location worked. Callers retry rather than conclude.
   */
  | "timeout"
  /** Something else — no Play Services, no providers at all. */
  | "unavailable";

export interface LocationResult {
  ok: boolean;
  /** Null when ok. */
  failure: LocationFailure | null;
  /** The position, when there is one. Callers that only need availability ignore it. */
  coords: { lat: number; lng: number } | null;
}

/**
 * Plugin error codes we care about, from GeolocationErrors.kt. Matched as
 * substrings because the plugin prefixes them (`OS-PLUG-GLOC-0007`) and has
 * changed that prefix between majors before.
 */
const DISABLED_CODES = ["GLOC-0007", "GLOC-0017"];
const DENIED_CODES = ["GLOC-0003", "GLOC-0009"];
/** GET_LOCATION_TIMEOUT — "Could not obtain location in time." */
const TIMEOUT_CODES = ["GLOC-0010"];

function classify(err: unknown): LocationFailure {
  const code = String((err as { code?: string })?.code ?? "");
  const message = String((err as { message?: string })?.message ?? "");
  const haystack = `${code} ${message}`;

  if (DISABLED_CODES.some((c) => haystack.includes(c))) return "location-disabled";
  if (DENIED_CODES.some((c) => haystack.includes(c))) return "permission-denied";
  if (TIMEOUT_CODES.some((c) => haystack.includes(c))) return "timeout";

  // Web fallback: PositionError codes — 1 is PERMISSION_DENIED, 3 is TIMEOUT.
  // The browser has no notion of a device-wide toggle.
  if ((err as { code?: number })?.code === 1) return "permission-denied";
  if ((err as { code?: number })?.code === 3) return "timeout";

  return "unavailable";
}

/**
 * Where is the user? Asks for permission if it has not been asked yet.
 *
 * `requestPermissions` is deliberate rather than `checkPermissions` alone:
 * this is the call that raises the native dialog, and a gate that never asks
 * is a gate the user cannot get past. It is only reached from an explicit tap
 * or from the launch check, never speculatively mid-session.
 */
export async function requestLocation(timeoutMs: number): Promise<LocationResult> {
  const { Geolocation } = await import("@capacitor/geolocation");

  try {
    const status = await Geolocation.checkPermissions();
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      const asked = await Geolocation.requestPermissions();
      if (asked.location !== "granted" && asked.coarseLocation !== "granted") {
        // "denied" is final on Android; anything else can be asked again.
        return {
          ok: false,
          failure: asked.location === "denied" ? "permission-denied" : "permission-prompt",
          coords: null,
        };
      }
    }

    const position = await Geolocation.getCurrentPosition({
      // Coarse is enough and far faster: the question is usually whether a
      // position exists, not exactly where. The picker refines it later.
      enableHighAccuracy: false,
      timeout: timeoutMs,
    });
    return {
      ok: true,
      failure: null,
      coords: { lat: position.coords.latitude, lng: position.coords.longitude },
    };
  } catch (err) {
    return { ok: false, failure: classify(err), coords: null };
  }
}

/**
 * Read the permission without asking for it, for callers that must not prompt.
 *
 * Unlike `navigator.permissions.query`, this reports the *app's* permission,
 * which is the one that decides anything on Android.
 */
export async function peekLocationPermission(): Promise<"granted" | "denied" | "prompt"> {
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const status = await Geolocation.checkPermissions();
    if (status.location === "granted" || status.coarseLocation === "granted") return "granted";
    if (status.location === "denied") return "denied";
    return "prompt";
  } catch {
    return "prompt";
  }
}

/** True on a real device, where the native plugin is in play. */
export function isNativeLocation(): boolean {
  return Capacitor.isNativePlatform();
}
