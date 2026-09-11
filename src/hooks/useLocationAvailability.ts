/**
 * Can we locate this user right now? (SVC-281)
 *
 * ## The one sentence this serves
 *
 * The gate appears only when we genuinely cannot place the user — the OS
 * location toggle is off, or the app has no permission. Someone with location
 * switched on must never see it. Four attempts broke that sentence in four
 * different ways before the cause turned out to be the API, not the logic;
 * `lib/geolocation.ts` records what the web API could not tell us and why.
 *
 * ## Asking is the point
 *
 * This does not peek at a permission and decide. It *asks*, through the
 * Capacitor plugin, which means a user who has never granted anything gets the
 * native Android dialog here — the same one Urban Company and Zepto show. A
 * gate that reports "permission is off" without ever offering the prompt is a
 * dead end, which is exactly what the earlier web-API version was.
 *
 * ## Nothing waits on the answer
 *
 * `isResolving` does not block the app. Callers render normally while the
 * request is outstanding and raise the gate only once it comes back negative.
 * That is what makes a generous timeout affordable, and it is why the earlier
 * versions' race to answer fast — and the wrong answers that came from
 * rushing — is no longer a trade worth making.
 *
 * ## `enabled`, and not asking too early
 *
 * The answer resolves once and is kept, so *when* it resolves decides what the
 * user sees for the rest of the session. `AppGate` mounts at launch, on the
 * login screen, before any session exists — resolving there produced a stale
 * "cannot locate" that survived login. Callers hold `enabled` false until the
 * question is real.
 */
import { useEffect, useState } from "react";
import { requestLocation, type LocationFailure } from "@/lib/geolocation";

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
 * How long to wait for a fix.
 *
 * Generous, and affordable because nothing is blocked on it: the caller
 * renders the app while this runs and raises the gate only if the answer comes
 * back negative. It also has to outlast a human answering the native
 * permission dialog, which this call can raise.
 *
 * Measured on device before the plugin, location on throughout: consecutive
 * cold starts answered in 1ms, 43ms, 836ms and 8256ms. Nothing shorter than
 * this covers that spread.
 */
const PROBE_TIMEOUT_MS = 10_000;

const AVAILABLE: LocationAvailability = { isResolving: false, blocked: false, reason: null };

function blockedBy(reason: LocationBlockedReason): LocationAvailability {
  return { isResolving: false, blocked: true, reason };
}

/**
 * How many times a timeout is retried before it counts as an answer.
 *
 * Only timeouts: a refusal or a disabled toggle is a real answer and is taken
 * first time. A timeout is not evidence of anything — the GPS was still coming
 * up — and the cost of asking again is nothing, since the app is rendered and
 * nobody is waiting on this.
 */
const TIMEOUT_RETRIES = 2;

/** Plugin failure → the reason the gate's copy is written against. */
const REASON_FOR: Record<LocationFailure, LocationBlockedReason> = {
  "location-disabled": "device-off",
  "permission-denied": "permission-denied",
  "permission-prompt": "permission-prompt",
  // Out of patience, not out of permission. "Where are you?" is the honest
  // headline: we do not know why, so we do not name a fix.
  timeout: "unknown",
  unavailable: "unknown",
};

export function useLocationAvailability(enabled = true): LocationAvailability {
  const [state, setState] = useState<LocationAvailability>({
    isResolving: true,
    blocked: false,
    reason: null,
  });

  useEffect(() => {
    // Not yet — see `enabled`. Stay in `isResolving` so callers render a
    // spinner rather than acting on an answer that has not been sought.
    if (!enabled) return;

    let cancelled = false;
    const settle = (next: LocationAvailability) => {
      if (!cancelled) setState(next);
    };

    void (async () => {
      // Asked through the plugin — the only thing that can answer truthfully
      // on Android, and the call that raises the native permission dialog when
      // there is one to raise.
      //
      // A timeout is retried rather than believed. Straight after a cold start
      // the same device answered in 130ms on one launch and not within ten
      // seconds on the next, with location switched on throughout; concluding
      // "cannot locate" from that gated a working user. Every other failure is
      // a real answer and is taken first time.
      let result = await requestLocation(PROBE_TIMEOUT_MS);
      for (let retry = 0; result.failure === "timeout" && retry < TIMEOUT_RETRIES; retry++) {
        if (cancelled) return;
        result = await requestLocation(PROBE_TIMEOUT_MS);
      }
      if (cancelled) return;

      settle(result.ok || !result.failure ? AVAILABLE : blockedBy(REASON_FOR[result.failure]));
    })();

    return () => {
      cancelled = true;
    };
    // Resolves once, when `enabled` first turns true — not on every render.
    // Re-probing mid-session could drop a gate the user is currently
    // answering, so `enabled` is the only trigger.
  }, [enabled]);

  return state;
}
