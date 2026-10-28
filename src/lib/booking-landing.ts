/**
 * Where the root gate sends a consumer whose last session left a booking in
 * flight (SVC-385).
 *
 * A customer who taps "Book" and then closes the app comes back to look at the
 * tracker — the ETA, the Pro's name, the OTP. Landing them on home instead
 * means a tap into Activity, finding the live booking in a list, then a tap
 * into tracking: three screens between the app opening and the information
 * they opened it for.
 *
 * Pulled out of AppGate as pure functions mirroring `pro-gate.ts` — the rules
 * are the part worth pinning, and reaching them through the component means
 * driving auth, the router, and the query client.
 *
 * The rules:
 *
 * - Only `{accepted, en_route, in_progress}` counts. `requested` is still
 *   waiting for a Pro to accept — the cleanup sweeper will cancel it in a few
 *   minutes if no one bites — and sending the user to a tracking screen that
 *   says "finding a professional" the moment they open the app would be
 *   dishonest about what they can actually see. `completed` / `cancelled` are
 *   done.
 * - Launch landing only. A user who, in-session, navigates back to home from
 *   tracking is deciding to leave the tracker; forcing them back would make
 *   the home nav a loop. One-shot per sign-in, same pattern as the Pro gate.
 * - An error (5xx, offline, failed refetch) never redirects. We do not know
 *   whether there is an in-flight booking, and guessing either way is worse
 *   than leaving them on home — tracking has its own error UI.
 */
import type { Booking, BookingStatus } from "./mock-data";

/** Booking statuses that pre-empt the home landing on cold launch. */
const ACTIVE_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "ACCEPTED",
  "EN_ROUTE",
  "IN_PROGRESS",
]);

export function isActiveBookingStatus(status: BookingStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

/**
 * The first booking worth pre-empting home for, or null when there is none.
 *
 * Returns an id, not the row, so the caller can navigate without carrying
 * the booking blob through its props. React Query's cache is still the
 * authoritative source once tracking mounts.
 */
export function firstActiveBookingId(
  bookings: ReadonlyArray<Pick<Booking, "id" | "status">> | undefined,
): string | null {
  return bookings?.find((b) => isActiveBookingStatus(b.status))?.id ?? null;
}

export type BookingLandingState = "loading" | "has-active" | "none" | "error";

export type BookingLandingVerdict =
  /** Hold a spinner: the answer decides whether to redirect to tracking. */
  | "wait"
  /** Render the route as asked. */
  | "pass"
  /** Redirect to `/tracking/<id>`. */
  | "to-tracking";

export function bookingLandingVerdict({
  pathname,
  state,
  landed,
}: {
  pathname: string;
  state: BookingLandingState;
  landed: boolean;
}): BookingLandingVerdict {
  // Every path other than "/" respects the user's own navigation. The pre-empt
  // is a *launch* behaviour; backing out of tracking to home must not loop.
  if (pathname !== "/" || landed) return "pass";
  if (state === "loading") return "wait";
  if (state === "has-active") return "to-tracking";
  // "none" or "error" — nothing worth pre-empting; home is correct.
  return "pass";
}

/**
 * Whether this render consumed the launch landing.
 *
 * Both "/" (the home we were about to show) and "/tracking/..." (the
 * destination of a replace-navigate) count: once the user is looking at
 * tracking, a later tap back to home must not re-trigger the redirect, so
 * the ref flips the moment the redirect lands. Mirrors `consumesLanding`
 * from pro-gate.ts.
 *
 * An error (no answer) does not consume: a cold-launch where /bookings/
 * failed should re-check on the next launch, not pretend the landing was
 * resolved. Same for a render that never reached the gate (profile setup
 * redirect, blank restoring splash).
 */
export function consumesBookingLanding(
  pathname: string,
  state: BookingLandingState,
  reachedGate: boolean,
): boolean {
  if (!reachedGate) return false;
  if (state === "loading" || state === "error") return false;
  return pathname === "/" || pathname.startsWith("/tracking/");
}

/**
 * Whose sign-in has had its launch landing, after this render.
 *
 * Keyed by user id so signing out and in as someone else lands them afresh.
 * Cleared on sign-out so the same user signing back in during one app run
 * is also landed afresh — the same ref-reset trick pro-gate uses to avoid
 * the "same Pro signs out/in and the ref stays stale" bug on device.
 */
export function nextBookingLandedFor(
  current: string | null,
  {
    userId,
    signedOut,
    consumes,
  }: {
    userId: string | undefined;
    /** Signed out for real: not restoring a session, and no user. */
    signedOut: boolean;
    /** What `consumesBookingLanding` says about this render. */
    consumes: boolean;
  },
): string | null {
  if (signedOut) return null;
  if (userId && consumes) return userId;
  return current;
}
