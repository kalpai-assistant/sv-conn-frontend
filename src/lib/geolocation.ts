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

import { detectPlatform } from "./platform";

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

// Plugin error codes, from GeolocationErrors.kt. Matched as substrings because
// the plugin prefixes them (`OS-PLUG-GLOC-0007`) and has changed that prefix
// between majors before.

/**
 * Location services are off. GLOC-0009 belongs here rather than with the
 * denials: declining "Turn on Location" leaves the toggle exactly as it was,
 * so the state — and the remedy — is unchanged.
 */
const DISABLED_CODES = ["GLOC-0007", "GLOC-0017", "GLOC-0009"];
/**
 * LOCATION_PERMISSIONS_DENIED only.
 *
 * GLOC-0009 (LOCATION_ENABLE_REQUEST_DENIED) deliberately lives with the
 * disabled codes below instead: the user declined *turning location on*, not
 * the app's permission. Calling that "permission denied" would name the wrong
 * remedy and, worse, disable the Enable button — when tapping it again is
 * exactly what should work, since the dialog can be raised as often as we like.
 */
const DENIED_CODES = ["GLOC-0003"];
/** GET_LOCATION_TIMEOUT — "Could not obtain location in time." */
const TIMEOUT_CODES = ["GLOC-0010"];

function classify(err: unknown): LocationFailure {
  const code = String((err as { code?: string })?.code ?? "");
  const message = String((err as { message?: string })?.message ?? "");
  const haystack = `${code} ${message}`;

  if (DISABLED_CODES.some((c) => haystack.includes(c))) return "location-disabled";
  if (DENIED_CODES.some((c) => haystack.includes(c))) return "permission-denied";
  if (TIMEOUT_CODES.some((c) => haystack.includes(c))) return "timeout";

  // Web fallback: `GeolocationPositionError` codes, which is what the plugin
  // rejects with on the PWA — it delegates straight to `navigator.geolocation`
  // and passes the browser's own error through. The browser has no notion of a
  // device-wide toggle, so there is no `location-disabled` to map to.
  //
  // 2 is POSITION_UNAVAILABLE, and it is treated as a timeout rather than as
  // its own dead end (SVC-318). On iOS it is what Safari sends when the fix
  // simply is not there yet — a home-screen PWA resumed from background, a
  // cold start before Location Services has a position, indoors on Wi-Fi-only
  // positioning. It is the same "not an answer" that GLOC-0010 is on native,
  // and the callers already retry timeouts rather than believing them. Calling
  // it `unavailable` instead made the gate conclude "we cannot locate you"
  // from a fix that was merely late.
  const webCode = (err as { code?: number })?.code;
  if (webCode === 1) return "permission-denied";
  if (webCode === 2 || webCode === 3) return "timeout";

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
    // Both of these are native-only conveniences. On web the plugin has no
    // `requestPermissions` at all (it throws `unimplemented`) and
    // `checkPermissions` needs `navigator.permissions`, which it throws
    // without — so on the PWA neither call is allowed to decide anything.
    // `getCurrentPosition` is the call that raises the browser's own prompt,
    // and it is reached below regardless (SVC-318).
    if (Capacitor.isNativePlatform()) {
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
 * Offer to turn device location on, without leaving the app (SVC-283).
 *
 * ## Why this goes through `watchPosition`
 *
 * When the OS location toggle is off, `getCurrentPosition`, `checkPermissions`
 * and `requestPermissions` all refuse immediately — the plugin guards them with
 * `checkLocationState`, which sends `LOCATION_DISABLED` and stops. That is why
 * Enable could only ever show a message telling the user to visit Settings.
 *
 * `watchPosition` carries no such guard. Its path reaches
 * `checkLocationPreconditions`, which runs Play Services' location-settings
 * check and raises the resolution dialog — Google's "For a better experience,
 * your device will need to use Location Accuracy", with a **Turn on** button
 * that flips the toggle in place. It is the same dialog Zepto and Urban
 * Company show, and the plugin already registers its result handler in
 * `load()`.
 *
 * Verified on device (Samsung, Android 14, location off, permission granted):
 * the dialog appeared, "Turn on" moved `location_mode` 0 → 3 and the watch
 * returned a position immediately; "No, thanks" produced
 * `LOCATION_ENABLE_REQUEST_DENIED` and left the toggle alone.
 *
 * ## The watch must always be cleared
 *
 * A watch is a stream, not a one-shot. On success it keeps running — and keeps
 * the GPS awake — until `clearWatch`, so every exit path here clears it. The
 * denial path cleans itself up inside the plugin (clearing it afterwards
 * reports "WatchId not found"), which is why the clear is best-effort rather
 * than asserted.
 */
export async function enableDeviceLocation(timeoutMs: number): Promise<LocationResult> {
  const { Geolocation } = await import("@capacitor/geolocation");

  let watchId: string | null = null;
  let settled = false;

  try {
    return await new Promise<LocationResult>((resolve) => {
      const finish = (result: LocationResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      // The dialog waits on a human, so this bound is the user's patience
      // rather than the platform's. Without it a dismissed-but-unanswered
      // dialog would leave the caller spinning forever.
      const timer = setTimeout(
        () => finish({ ok: false, failure: "timeout", coords: null }),
        timeoutMs,
      );

      Geolocation.watchPosition(
        { enableHighAccuracy: false, timeout: timeoutMs },
        (position, err) => {
          if (err) {
            finish({ ok: false, failure: classify(err), coords: null });
            return;
          }
          if (position) {
            finish({
              ok: true,
              failure: null,
              coords: { lat: position.coords.latitude, lng: position.coords.longitude },
            });
          }
        },
      )
        // The callback can fire before this resolves — that is the ordering the
        // plugin actually uses — so the id is only recorded here and the
        // clearing is left to the `finally` below, which runs after the promise
        // has settled either way. An extra clear here looked prudent and was
        // dead code: a mutation removing it changed nothing.
        .then((id) => {
          watchId = id;
        })
        .catch((err: unknown) => finish({ ok: false, failure: classify(err), coords: null }));
    });
  } finally {
    if (watchId) {
      // Best-effort: the plugin drops the watch itself when the enable request
      // is denied, so this throws "WatchId not found" on that path.
      await Geolocation.clearWatch({ id: watchId }).catch(() => {});
    }
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

/**
 * Can this platform answer a position request that no one tapped for?
 *
 * ## Why the question exists (SVC-319)
 *
 * The launch probe asks where the user is before they have touched anything,
 * so the gate can stay down for someone we can already locate. That is only
 * safe where a request without a user gesture is allowed to prompt.
 *
 * iOS Safari does not allow it. A `getCurrentPosition` that no tap initiated
 * is refused outright — Safari will not raise its permission sheet for one —
 * and the refusal arrives as `PERMISSION_DENIED`, identical to a user saying
 * no. Reported from a home-screen PWA with iOS Location Services switched on:
 * the gate was already showing the denial banner at launch, before the user
 * could tap Enable, because the probe had answered for them.
 *
 * So on iOS the probe is skipped and the gate opens in its neutral "Where are
 * you?" state. Enable still works — that tap *is* the gesture, and it raises
 * the real Safari prompt.
 *
 * Native is unaffected: the Capacitor plugin talks to the OS rather than to a
 * browser gesture model, and Android Chrome allows the ungestured call (the
 * probe answers `granted` there and the gate never appears).
 */
export function canProbeWithoutGesture(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return detectPlatform().platform !== "ios";
}
