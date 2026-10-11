/**
 * Is the device online? (SVC-351)
 *
 * ## The one honest answer this gives
 *
 * `navigator.onLine === false` is believed; `=== true` is not. The browser's
 * boolean is reliable in one direction only: a flipped-off network, airplane
 * mode or a dropped Wi-Fi radio flips it to false synchronously, and that is
 * the signal worth having — a slower "wait for a fetch to fail" would still
 * paint the infinite spinner that SVC-351 exists to kill.
 *
 * The other direction is a lie we have seen on device. On several Android
 * WebViews `onLine` stays `true` through a real cell-signal drop, which is why
 * callers must not read a `true` from this hook as proof the backend is
 * reachable. The first fetch's outcome is the real answer there — React Query
 * reporting `isError` on `/users/me/addresses` is the signal the gate
 * ultimately uses, with this hook only providing the fast "we already know we
 * are offline" path.
 *
 * ## SSR
 *
 * `window` is undefined during Vite's SSR pass. Returning `true` there is the
 * conservative default: the server HTML renders as if the device were online,
 * and the client replaces it with the real value on hydration. Returning
 * `false` instead would flash the offline UI on every first paint of the PWA.
 *
 * ## Why not debounce here
 *
 * Debouncing the `online` event (SVC-351 asks for 500 ms, so a flapping
 * connection does not thrash a retry) belongs with the caller that performs
 * the retry, not with the hook that reports the status. The gate reads the
 * boolean; it is the gate's retry effect that waits.
 */
import { useEffect, useState } from "react";

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return isOnline;
}
