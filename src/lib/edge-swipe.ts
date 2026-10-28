/**
 * SVC-391: iOS edge-swipe-back rules.
 *
 * iOS users expect left-edge-swipe to pop the view, and TanStack Router inside
 * a Capacitor WebView gives them nothing — the native UIKit back gesture needs
 * a UINavigationController we don't have, so the gesture is implemented in JS.
 * Lives in a separate file from the hook so the rules can be unit-tested
 * without jsdom + Capacitor plugins.
 *
 * Pathname rules only cover routes where the gesture itself is wrong. The
 * other defences (open sheet dismiss, mid-OTP interception) run through
 * `runBackInterceptors` — anything already registered against the hardware
 * back button gets the swipe too, so AuthFlow's OTP step and every sheet
 * work without being named here.
 */

/**
 * Should the edge-swipe gesture be disabled at this pathname?
 *
 * `/cart` is the sole route where swiping away mid-flow would cross the
 * Razorpay checkout. Razorpay's modal is a native overlay on iOS and the
 * WebView may not even receive the gesture while it is up, but blocking the
 * route for the whole dwell keeps the behaviour the same before and during
 * the modal.
 *
 * `/invite` is public and gated differently — a swipe-back from here lands on
 * an auth splash the user did not come from.
 */
export function isEdgeSwipeBackBlocked(pathname: string): boolean {
  return pathname.startsWith("/cart") || pathname === "/invite";
}
