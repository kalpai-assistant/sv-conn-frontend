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
 *   permission `granted` + no position available  →  the OS toggle is off
 *
 * That probe is safe precisely because permission is already granted: no dialog
 * can appear, so we spend nothing. In every other permission state we must not
 * call it at all — the Android prompt is one-shot, and firing it on launch
 * without the user asking is how a permanent denial happens. So the permission
 * state *is* the answer there, and the probe never runs.
 *
 * ## The probe reads cache only, and never waits
 *
 * "No position available" has to mean *right now*, not *after five seconds*.
 * Android does not report a disabled toggle as an error — it just never
 * answers — so waiting cannot distinguish "off" from "the GPS is still
 * warming up", and trying to stalls every launch behind a spinner. See
 * `hasCachedPosition` for the measurements that killed the waiting version.
 *
 * ## Unknowns fail open; a missing fix does not
 *
 * When we cannot tell what is going on — no Permissions API, or it threw — the
 * answer is `unknown` and the user is let through. But a granted permission
 * with no cached position is not an unknown: it is the specific state the gate
 * exists for. Letting that through would silently reintroduce the "no partners
 * found nearby" failure this whole feature is built to prevent.
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
 * How old a cached fix may be and still count as "we know where they are".
 *
 * Ten minutes is chosen for what it is used for: proving location *works*, not
 * deciding where to send a plumber. Anything the OS still holds is evidence the
 * radio is on and the app can read it, which is the entire question here. The
 * actual position is read later, by the picker, on an explicit tap.
 */
const CACHE_MAX_AGE_MS = 600_000;

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
 * Is there a position the OS already holds? Only ever called with permission
 * granted, so this cannot raise a dialog.
 *
 * ## `timeout: 0` is the whole design, and it is not a mistake
 *
 * The first version of this waited up to 5s for a fix and treated a failure as
 * "the OS toggle is off". Measured on a real device (Samsung, Android 14,
 * Chrome 152), that does not work:
 *
 * | OS location | outcome                    | time                     |
 * |-------------|----------------------------|--------------------------|
 * | off         | `TIMEOUT` (code 3), never 2 | exactly the timeout given |
 * | on, cold    | success                     | ~5.0 s                    |
 * | on, warm    | success                     | ~1 ms                     |
 *
 * Android never reports POSITION_UNAVAILABLE for a disabled toggle — it simply
 * never answers, for as long as you are willing to wait (verified at 5s and
 * 20s). So "off" and "cold GPS" are separated by about 30ms of luck, and any
 * threshold between them is a coin flip that also stalls every launch behind a
 * spinner.
 *
 * `timeout: 0` removes the guess. It never starts the hardware: either a fresh
 * enough fix is already cached, or the call fails immediately. Measured on the
 * same device: 1ms to succeed with a cached fix, 3ms to fail without one.
 *
 * ## What this deliberately gets "wrong"
 *
 * Location on, but nothing cached — a genuine cold first launch — reads as
 * blocked. That is accepted, because the gate is not a punishment: it offers
 * "Use my current location", and the slow GPS wait then happens behind a
 * spinner the user asked for. A five-second mystery stall on launch is worse
 * than one extra tap, and unlike the stall it explains itself.
 */
function hasCachedPosition(): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      // timeout: 0 — answer from cache or fail now; never wake the GPS.
      // enableHighAccuracy is meaningless with no acquisition, and false keeps
      // it explicit that this is not trying to fix a position.
      { enableHighAccuracy: false, timeout: 0, maximumAge: CACHE_MAX_AGE_MS },
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

      settle((await hasCachedPosition()) ? AVAILABLE : blockedBy("device-off"));
    })();

    return () => {
      cancelled = true;
    };
    // Resolved once per mount. Re-running would re-probe mid-session and could
    // drop a gate the user is currently answering.
  }, []);

  return state;
}
