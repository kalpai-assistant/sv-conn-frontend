/**
 * A stack of handlers that get first refusal on the Android hardware back
 * button, ahead of the router.
 *
 * `main.mobile.tsx` owns the one Capacitor `backButton` listener and reasons
 * about `router.history`. That covers anything rendered inside a route — but
 * not UI mounted outside the router. `AuthFlow` is the case that forced this:
 * it renders as an auth gate above `children` in `__root.tsx`, so on the OTP
 * step back finds nothing to pop, sees the pathname is "/", and offers to
 * exit the app. A user who mistyped their number cannot get back to phone
 * entry to fix it.
 *
 * Registering a second Capacitor listener would not work — Capacitor invokes
 * every listener with no propagation control, so the router's handler would
 * still run and still exit.
 *
 * Last registered wins, so a sheet opened above another claims back first.
 * Native-only by construction: nothing calls `runBackInterceptors` in the web
 * build, where the visible control is the only way back.
 */
type BackInterceptor = () => boolean;

const interceptors: BackInterceptor[] = [];

/**
 * Registers `fn` to receive back presses before the router does. It returns
 * `true` to mean "handled, stop here".
 *
 * Returns its own unregister function, shaped to drop straight into a
 * `useEffect` cleanup.
 */
export function pushBackInterceptor(fn: BackInterceptor): () => void {
  interceptors.push(fn);
  return () => {
    const i = interceptors.indexOf(fn);
    if (i !== -1) interceptors.splice(i, 1);
  };
}

/**
 * Runs interceptors top-down, stopping at the first that handles the press.
 * Returns whether any of them did.
 */
export function runBackInterceptors(): boolean {
  for (let i = interceptors.length - 1; i >= 0; i--) {
    if (interceptors[i]()) return true;
  }
  return false;
}
