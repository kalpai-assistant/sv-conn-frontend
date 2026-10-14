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
 * Whether the consumer location gate ("Where are you?") stays out of the way.
 *
 * That gate exists so a customer has an address to book against, and fires for
 * anyone with no saved address — which is every new invitee. So it never covers
 * the Pro app, and for a Pro it does not cover Profile either: found on device,
 * the Pro Home avatar led to "Where are you?", leaving a Pro with no address no
 * way to sign out or rename themselves. Booking screens keep the gate, Pro or
 * not: that is where an address is genuinely needed.
 */
export function skipsLocationGate(pathname: string, proState: ProState): boolean {
  if (isProRoute(pathname)) return true;
  // Joining a team (SVC-322 part 3): the invitee is not a Pro yet, has no
  // saved address, and is not booking anything.
  if (pathname === "/invite") return true;
  return proState === "pro" && (pathname === "/profile" || pathname.startsWith("/profile/"));
}

/**
 * Whether a provider-role user (an SP owner) is shown this route as asked,
 * instead of being moved into the provider app (SVC-354).
 *
 * `/invite` only, exactly. An owner can never join a team — their account has
 * its own Pro-for-self, and a phone keeps its role for life — but one who
 * taps an invite link was silently dropped on /provider with nothing saying
 * why. The screen there tells them, and links back. No form: it could only
 * fail. Every other route still moves them, as it always has.
 */
export function providerSeesInviteRoute(pathname: string): boolean {
  return pathname === "/invite";
}

/**
 * Whether evaluating this route used up the launch landing.
 *
 * Only "/" and the Pro app count. A Pro whose first screen is something else —
 * the name setup on /profile, a tracking push — has not been offered the Pro
 * app yet, so their first arrival on "/" still lands them there.
 *
 * An error does not count either: it was no answer. A Pro who opened the app
 * offline is let through to the consumer home, and is landed in the Pro app
 * once a later refetch (on focus) says who they are.
 *
 * Nor does a render that never reached the gate (`reachedGate`): the blank
 * splash while the session restores, or the redirect to name setup. Found on
 * device — both happen on "/", and counting them meant the redirect to /pro
 * was skipped before it was ever rendered.
 */
export function consumesLanding(
  pathname: string,
  proState: ProState,
  reachedGate: boolean,
): boolean {
  if (!reachedGate) return false;
  if (proState === "loading" || proState === "error") return false;
  return pathname === "/" || isProRoute(pathname);
}
