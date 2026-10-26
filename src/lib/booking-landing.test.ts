/**
 * The cold-launch "do we send them to tracking?" verdict (SVC-385).
 *
 * These helpers are pure so the rules can be pinned without driving the
 * router + query client. Two things earn their test:
 *   1. Only `{ACCEPTED, EN_ROUTE, IN_PROGRESS}` counts as active. `REQUESTED`
 *      is still fishing for a Pro and the tracker there says "finding a
 *      professional" — pre-empting home for it would be dishonest.
 *   2. Launch-only. A user who, in-session, navigates back to home from
 *      tracking must not be bounced again. Mirrored off pro-gate's own
 *      `landed` pattern.
 */
import { describe, expect, it } from "vitest";
import type { Booking, BookingStatus } from "@/lib/mock-data";
import {
  bookingLandingVerdict,
  consumesBookingLanding,
  firstActiveBookingId,
  isActiveBookingStatus,
  nextBookingLandedFor,
} from "@/lib/booking-landing";

type MinimalBooking = Pick<Booking, "id" | "status">;
const b = (id: string, status: BookingStatus): MinimalBooking => ({ id, status });

describe("isActiveBookingStatus", () => {
  it("matches only the three in-flight statuses the ticket calls out", () => {
    expect(isActiveBookingStatus("ACCEPTED")).toBe(true);
    expect(isActiveBookingStatus("EN_ROUTE")).toBe(true);
    expect(isActiveBookingStatus("IN_PROGRESS")).toBe(true);
  });

  it("rejects REQUESTED — the Pro hasn't bitten yet, tracker would read 'finding a professional'", () => {
    expect(isActiveBookingStatus("REQUESTED")).toBe(false);
  });

  it("rejects terminal + expired statuses — the sweeper already cleaned those", () => {
    expect(isActiveBookingStatus("COMPLETED")).toBe(false);
    expect(isActiveBookingStatus("CANCELLED")).toBe(false);
    expect(isActiveBookingStatus("EXPIRED")).toBe(false);
  });
});

describe("firstActiveBookingId", () => {
  it("returns null when nothing is in flight", () => {
    expect(firstActiveBookingId([b("1", "COMPLETED"), b("2", "CANCELLED")])).toBeNull();
  });

  it("returns null for an undefined list (query still pending — caller handles that path)", () => {
    expect(firstActiveBookingId(undefined)).toBeNull();
  });

  it("picks the first active booking even when it is not the first row", () => {
    // Preserves list order: an older active booking paints its id, not the
    // newest one. The list the API returns is createdAt desc, so "first"
    // here is "most recent in-flight", which is also what the user most
    // likely wants to look at.
    expect(
      firstActiveBookingId([
        b("done", "COMPLETED"),
        b("live", "IN_PROGRESS"),
        b("older", "EN_ROUTE"),
      ]),
    ).toBe("live");
  });
});

describe("bookingLandingVerdict", () => {
  it("passes everything that is not the home route (never pre-empt an in-session navigation)", () => {
    expect(
      bookingLandingVerdict({ pathname: "/service/x", state: "has-active", landed: false }),
    ).toBe("pass");
    expect(
      bookingLandingVerdict({ pathname: "/bookings", state: "has-active", landed: false }),
    ).toBe("pass");
  });

  it("passes when the sign-in has already landed (one-shot pre-empt)", () => {
    expect(bookingLandingVerdict({ pathname: "/", state: "has-active", landed: true })).toBe(
      "pass",
    );
  });

  it("waits on '/' while the query is still loading — the decision isn't made yet", () => {
    expect(bookingLandingVerdict({ pathname: "/", state: "loading", landed: false })).toBe("wait");
  });

  it("redirects to tracking on '/' when there is an in-flight booking and we haven't landed", () => {
    expect(bookingLandingVerdict({ pathname: "/", state: "has-active", landed: false })).toBe(
      "to-tracking",
    );
  });

  it("passes on '/' when there is nothing in flight — home is the correct screen", () => {
    expect(bookingLandingVerdict({ pathname: "/", state: "none", landed: false })).toBe("pass");
  });

  it("passes on '/' when the query errored — guessing either way is worse than home", () => {
    // The whole point of distinguishing `error` from `none`: an error must
    // not consume the landing (see `consumesBookingLanding` below), so the
    // next launch gets another chance to answer the question.
    expect(bookingLandingVerdict({ pathname: "/", state: "error", landed: false })).toBe("pass");
  });
});

describe("consumesBookingLanding", () => {
  it("does not consume when the render never reached the gate", () => {
    // Blank splash during AuthProvider's token-refresh probe, profile-setup
    // redirect — both can fire on '/' without the user having actually seen
    // home. Counting them would land the user before the gate ever rendered,
    // same shape as the pro-gate bug the comment in __root.tsx references.
    expect(consumesBookingLanding("/", "has-active", false)).toBe(false);
  });

  it("does not consume on loading or error — the answer isn't settled", () => {
    expect(consumesBookingLanding("/", "loading", true)).toBe(false);
    expect(consumesBookingLanding("/", "error", true)).toBe(false);
  });

  it("consumes on '/' once the answer is in", () => {
    expect(consumesBookingLanding("/", "has-active", true)).toBe(true);
    expect(consumesBookingLanding("/", "none", true)).toBe(true);
  });

  it("consumes on '/tracking/...' so the replace-navigate doesn't re-fire the redirect", () => {
    // Without this, the ref would stay stale after redirect — the next time
    // the router evaluates the gate, pathname is '/tracking/<id>', the
    // decision would re-run and the redirect would loop.
    expect(consumesBookingLanding("/tracking/abc", "has-active", true)).toBe(true);
  });

  it("does not consume on other routes — a user navigating to /bookings has not landed", () => {
    expect(consumesBookingLanding("/bookings", "has-active", true)).toBe(false);
    expect(consumesBookingLanding("/profile", "none", true)).toBe(false);
  });
});

describe("nextBookingLandedFor", () => {
  it("clears the ref on sign-out so the same user signing back in gets a fresh landing", () => {
    // Pro-gate's SVC-322 bug: the ref was keyed by user but never cleared,
    // so sign-out and sign-in during one run counted as already-landed and
    // the Pro was stuck on consumer home. This mirror avoids it.
    expect(nextBookingLandedFor("user-a", { userId: undefined, signedOut: true, consumes: true })).toBeNull();
  });

  it("stamps the user id when this render consumed the landing", () => {
    expect(
      nextBookingLandedFor(null, { userId: "user-a", signedOut: false, consumes: true }),
    ).toBe("user-a");
  });

  it("keeps the current value when nothing consumed this render", () => {
    expect(
      nextBookingLandedFor("user-a", { userId: "user-a", signedOut: false, consumes: false }),
    ).toBe("user-a");
  });

  it("does not stamp without a userId (SSR / anonymous render)", () => {
    expect(
      nextBookingLandedFor(null, { userId: undefined, signedOut: false, consumes: true }),
    ).toBeNull();
  });
});
