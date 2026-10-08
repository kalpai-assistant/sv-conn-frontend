/**
 * Where the root gate sends a consumer-role user who may also be a Pro (SVC-322).
 *
 * A team Pro signs up as a consumer, so the role-based gate in `__root.tsx`
 * cannot tell them apart; `GET /pros/me` can. Pulled out of AppGate as a pure
 * function because reaching these branches through the component means driving
 * auth, the router and the query client — and the rules are the part worth
 * pinning.
 *
 * The rules:
 *
 * - `/pro/*` is for Pros only. Someone who is not one is sent home; they can
 *   only have got there by a stale link or a push meant for an earlier account.
 * - A Pro opening the app lands in the Pro app: that is the work they opened it
 *   for. Once only, per sign-in — the Pro shell links to "/" so they can still
 *   book a service as a customer, and bouncing them back would make that link
 *   a loop. There is no role switcher; the two apps simply link to each other.
 * - Nothing else changes. A Pro anywhere in the consumer app stays there.
 *
 * `error` (a 5xx or no network) never redirects. It does not say whether they
 * are a Pro, and guessing either way is worse than leaving them where they are:
 * the screens show their own errors.
 */
import { isProRoute } from "@/lib/nav-visibility";

export type ProState = "loading" | "pro" | "not-pro" | "error";

export type ProGateVerdict =
  /** Hold a spinner: the answer decides which app to show. */
  | "wait"
  /** Render the route as asked. */
  | "pass"
  /** Redirect to the Pro app. */
  | "to-pro"
  /** Redirect to the consumer home. */
  | "to-home";

export function proGateVerdict({
  pathname,
  proState,
  landed,
}: {
  pathname: string;
  proState: ProState;
  /** Whether this sign-in has already had its launch landing. */
  landed: boolean;
}): ProGateVerdict {
  if (isProRoute(pathname)) {
    if (proState === "loading") return "wait";
    if (proState === "not-pro") return "to-home";
    return "pass";
  }
  if (pathname === "/" && !landed) {
    if (proState === "loading") return "wait";
    if (proState === "pro") return "to-pro";
  }
  return "pass";
}

/**
 * Whether evaluating this route used up the launch landing.
 *
 * Only "/" and the Pro app count. A Pro whose first screen is something else —
 * the name setup on /profile, a tracking push — has not been offered the Pro
 * app yet, so their first arrival on "/" still lands them there.
 */
export function consumesLanding(pathname: string, proState: ProState): boolean {
  if (proState === "loading") return false;
  return pathname === "/" || isProRoute(pathname);
}
