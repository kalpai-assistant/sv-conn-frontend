/**
 * Where a Pro is, for the heartbeat and the "location is off" warning (SVC-322).
 *
 * Two entry points, split by whether they may put a dialog on screen:
 *
 * - `readProLocation` never asks. The heartbeat runs it every 30 s, and
 *   `requestLocation` alone would raise the permission dialog on every tick for
 *   a Pro who has not answered it yet — so the permission is peeked first, and
 *   anything short of "granted" is reported, not requested.
 * - `askForProLocation` is for a tap (going online, the banner's "Turn on"). It
 *   may raise the permission dialog and then Android's "Turn on location"
 *   sheet, the same one the consumer location gate uses.
 *
 * Neither ever blocks anything. Tushar's call (2026-10-08): a Pro without
 * location is warned, never stopped from going online. The backend agrees — it
 * stores the heartbeat and reads it for nothing yet.
 */
import {
  enableDeviceLocation,
  peekLocationPermission,
  requestLocation,
  type LocationResult,
} from "@/lib/geolocation";

export type ProLocationStatus =
  /** We have a fix. */
  | "ok"
  /** The device's location switch is off. */
  | "off"
  /** The app was refused permission. On Android it cannot ask again. */
  | "denied"
  /** Permission not asked yet. A tap can ask. */
  | "prompt"
  /** No answer this time (GPS warming up, indoors). Not evidence of anything. */
  | "unknown";

export interface ProLocationReading {
  status: ProLocationStatus;
  coords: { lat: number; lng: number } | null;
}

/** How long a heartbeat waits for a fix before calling it "unknown". */
export const HEARTBEAT_FIX_TIMEOUT_MS = 10_000;

function fromResult(result: LocationResult): ProLocationReading {
  if (result.ok && result.coords) return { status: "ok", coords: result.coords };
  switch (result.failure) {
    case "location-disabled":
      return { status: "off", coords: null };
    case "permission-denied":
      return { status: "denied", coords: null };
    case "permission-prompt":
      return { status: "prompt", coords: null };
    default:
      return { status: "unknown", coords: null };
  }
}

/** One heartbeat's reading. Never raises a dialog. */
export async function readProLocation(): Promise<ProLocationReading> {
  const permission = await peekLocationPermission();
  if (permission === "denied") return { status: "denied", coords: null };
  if (permission === "prompt") return { status: "prompt", coords: null };
  return fromResult(await requestLocation(HEARTBEAT_FIX_TIMEOUT_MS));
}

/**
 * Ask for location from a tap: the permission dialog if it has not been
 * answered, then Android's "Turn on location" sheet if the switch is off.
 */
export async function askForProLocation(): Promise<ProLocationReading> {
  const first = fromResult(await requestLocation(HEARTBEAT_FIX_TIMEOUT_MS));
  if (first.status !== "off") return first;
  // The sheet waits on a person, so its bound is their patience.
  return fromResult(await enableDeviceLocation(30_000));
}

/** Whether the banner should say something. "unknown" is not a problem yet. */
export function locationNeedsAttention(status: ProLocationStatus | null): boolean {
  return status === "off" || status === "denied" || status === "prompt";
}

/** The banner's words for each problem. */
export function locationWarning(status: ProLocationStatus): { title: string; detail: string } {
  if (status === "denied") {
    return {
      title: "Location is blocked for EazyServ",
      detail:
        "Allow location for EazyServ in your phone’s settings so your team can see where you are.",
    };
  }
  return {
    title: "Location is off",
    detail: "Turn it on so your team can see where you are while you’re online.",
  };
}
