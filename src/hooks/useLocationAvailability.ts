/**
 * Can we locate this user right now? (SVC-281)
 *
 * ## Why this exists
 *
 * The launch gate originally asked everyone, every launch. On device that
 * proved self-defeating: a daily prompt becomes a reflex, and a reflex cannot
 * notice that the city is wrong — which is the one thing the screen is for.
 * The ticket had specified a conditional trigger from the start ("on app open,
 * when there is no usable location"); this hook is that condition.
 *
 * ## The awkward part: nothing reports the OS location toggle
 *
 * There is no web API for "is Location switched on in Android settings". The
 * Permissions API answers a different question — whether *this app* may ask —
 * and returns `granted` whether or not the device radio is on.
 *
 * The one way to tell them apart:
 *
 *   permission `granted` + `getCurrentPosition` fails  →  the OS toggle is off
 *
 * That probe is safe precisely because permission is already granted: no dialog
 * can appear, so we spend nothing. In every other permission state we must not
 * call it at all — the Android prompt is one-shot, and firing it on launch
 * without the user asking is how a permanent denial happens. So the permission
 * state *is* the answer there, and the probe never runs.
 *
 * ## Fail open
 *
 * Every failure path resolves to `blocked: false`. A spurious gate is worse
 * than a missed one: it blocks a user who is perfectly locatable, which is the
 * exact complaint this change exists to fix. The timeout below is the same
 * bet — see PROBE_TIMEOUT_MS.
 */
import { useEffect, useState } from "react";

/**
 * Why we cannot locate them — the gate's copy turns on this, because the
 * remedy differs and naming the wrong one sends the user to the wrong settings
 * screen.
 */
export type LocationBlockedReason =
  /** Permission is granted but the position call failed: the OS toggle is off. */
  | "device-off"
  /** Permission has not been asked for yet. "Enable" will fire the OS dialog. */
  | "permission-prompt"
  /** Permission was refused. Android will not ask twice; only settings can fix it. */
  | "permission-denied"
  /** No Permissions API, or it threw. We genuinely do not know. */
  | "unknown";

export interface LocationAvailability {
  /** True until resolved — render a spinner, not the gate, or it flashes. */
  isResolving: boolean;
  /** True when we cannot locate them and the gate should be shown. */
  blocked: boolean;
  /** Null when not blocked. */
  reason: LocationBlockedReason | null;
}

/**
 * How long to wait for the granted-permission probe.
 *
 * This is the hook's one real risk. The probe only runs when permission is
 * granted, and the interesting case is the OS toggle being off — where Android
 * is expected to fail fast with POSITION_UNAVAILABLE. If some device instead
 * hangs, every launch would stall for this long, so it is deliberately short
 * and a timeout resolves to *not blocked* rather than to `device-off`.
 *
 * Guessing "device-off" on a slow fix would gate a user whose location works —
 * reintroducing the complaint. Verified on device before merge.
 */
const PROBE_TIMEOUT_MS = 5_000;

const AVAILABLE: LocationAvailability = { isResolving: false, blocked: false, reason: null };

function blockedBy(reason: LocationBlockedReason): LocationAvailability {
  return { isResolving: false, blocked: true, reason };
}

/**
 * Read the permission state without prompting.
 *
 * `navigator.permissions` is missing on some Android WebViews and throws on
 * others; both mean "we do not know", which is a reason of its own rather than
 * an excuse to call `getCurrentPosition` and find out.
 */
async function readPermission(): Promise<PermissionState | null> {
  try {
    const query = navigator.permissions?.query;
    if (!query) return null;
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}

/**
 * Does a position actually resolve? Only ever called with permission granted,
 * so this cannot raise a dialog.
 */
function positionResolves(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    // Belt and braces: `timeout` below should fire first, but a WebView that
    // never calls either callback would otherwise leave the app on a spinner
    // forever. Fail open.
    const timer = setTimeout(() => finish(true), PROBE_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      () => {
        clearTimeout(timer);
        finish(true);
      },
      () => {
        clearTimeout(timer);
        finish(false);
      },
      // A cached fix is enough to prove location works, and is far cheaper than
      // waking the GPS on every launch. Low accuracy for the same reason: we
      // are asking whether a position exists, not where it is.
      { enableHighAccuracy: false, timeout: PROBE_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}

export function useLocationAvailability(): LocationAvailability {
  const [state, setState] = useState<LocationAvailability>({
    isResolving: true,
    blocked: false,
    reason: null,
  });

  useEffect(() => {
    let cancelled = false;
    const settle = (next: LocationAvailability) => {
      if (!cancelled) setState(next);
    };

    void (async () => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        // No geolocation at all — a desktop browser with it disabled, or an
        // odd WebView. We cannot locate them, and the gate's manual entry is
        // the whole point.
        settle(blockedBy("unknown"));
        return;
      }

      const permission = await readPermission();
      if (cancelled) return;

      if (permission === "denied") {
        settle(blockedBy("permission-denied"));
        return;
      }
      if (permission === "prompt") {
        settle(blockedBy("permission-prompt"));
        return;
      }
      if (permission !== "granted") {
        settle(blockedBy("unknown"));
        return;
      }

      settle((await positionResolves()) ? AVAILABLE : blockedBy("device-off"));
    })();

    return () => {
      cancelled = true;
    };
    // Resolved once per mount. Re-running would re-probe mid-session and could
    // drop a gate the user is currently answering.
  }, []);

  return state;
}
