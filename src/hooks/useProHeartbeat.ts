/**
 * The Pro's location heartbeat (SVC-322): `POST /pros/me/location` every 30 s
 * while online and while the app is on screen.
 *
 * - **Runs app-wide, not per screen.** `useProHeartbeatHost` is mounted once,
 *   in the root gate, for an online team Pro. On Pro Home alone it would stop
 *   the moment the Pro opened a job — the screen they are on while travelling.
 * - **Stops when offline.** Online means "give me jobs"; an offline Pro has no
 *   reason to be tracked.
 * - **Stops when backgrounded.** `visibilitychange` (which the Capacitor
 *   WebView fires on pause/resume) pauses it, and the first tick on return is
 *   immediate rather than up to 30 s late.
 * - **Respects the 10/min limit.** 30 s is 2 a minute. A 429 is skipped, never
 *   retried — the next tick is the retry.
 * - **Never prompts.** Each tick reads location through `readProLocation`,
 *   which reports a missing permission instead of asking for it. Asking is for
 *   taps (`askForProLocation`).
 *
 * The last reading's status is published through a tiny store, which Pro
 * Home's "location is off" banner reads with `useProLocationStatus`.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { sendProLocation } from "@/hooks/usePro";
import { readProLocation, type ProLocationStatus } from "@/lib/pro-location";

export const HEARTBEAT_MS = 30_000;

// --- The status store --------------------------------------------------------

let currentStatus: ProLocationStatus | null = null;
const listeners = new Set<() => void>();
let recheckHandler: (() => Promise<void>) | null = null;

function publish(status: ProLocationStatus | null) {
  if (status === currentStatus) return;
  currentStatus = status;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The heartbeat's last verdict, or null while it isn't running. */
export function useProLocationStatus(): ProLocationStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => currentStatus,
    () => null,
  );
}

/** Take a reading now — after the Pro has just turned location on, say. */
export function recheckProLocation(): Promise<void> {
  return recheckHandler?.() ?? Promise.resolve();
}

/** Test seam: forget everything between tests. */
export function resetProHeartbeatForTests() {
  currentStatus = null;
  listeners.clear();
  recheckHandler = null;
}

// --- The loop -------------------------------------------------------------------

export function useProHeartbeatHost(active: boolean) {
  // One tick at a time: a slow GPS fix must not stack a second request behind it.
  const inFlight = useRef(false);

  const tick = useCallback(async () => {
    if (inFlight.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    inFlight.current = true;
    try {
      const reading = await readProLocation();
      // "unknown" keeps the last verdict: a slow fix is not news.
      if (reading.status !== "unknown") publish(reading.status);
      if (reading.coords) {
        // A failure here — a 429, a dropped connection — waits for the next tick.
        await sendProLocation(reading.coords).catch(() => {});
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active) {
      publish(null);
      return;
    }
    recheckHandler = tick;
    void tick();
    const timer = setInterval(() => void tick(), HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (recheckHandler === tick) recheckHandler = null;
    };
  }, [active, tick]);
}
