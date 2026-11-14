import { describe, expect, it } from "vitest";
import {
  actorLabel,
  bookingsListPath,
  canForceCancel,
  checkCancelReason,
  formatIst,
  formatRupees,
  hasFilters,
  isCancellable,
  isUuid,
  itemsSummary,
  lastPage,
  refundCopy,
  shortId,
  timelineProChange,
  timelineTitle,
  totalCharged,
  validateBookingsSearch,
} from "@/lib/bookings";
import { BOOKING_ID, assignmentItem, booking, statusItem } from "@/test/booking-fixtures";

describe("validateBookingsSearch", () => {
  it("keeps every known filter", () => {
    expect(
      validateBookingsSearch({
        status: "en_route",
        disputed: true,
        from: "2026-11-01",
        to: "2026-11-07",
        phone: "98765 42501",
        sp: "sharma",
        page: 3,
        booking: BOOKING_ID,
      }),
    ).toEqual({
      status: "en_route",
      disputed: true,
      from: "2026-11-01",
      to: "2026-11-07",
      phone: "98765 42501",
      sp: "sharma",
      page: 3,
      booking: BOOKING_ID,
    });
  });

  it("sets every bad value to undefined, because the router merges the raw URL back in", () => {
    const search = validateBookingsSearch({
      status: "done",
      disputed: "yes",
      from: "0202-11-01",
      to: "tomorrow",
      phone: "  ",
      sp: "",
      page: 1,
      booking: "3f2c9a1e",
      provider_id: "not-a-uuid",
      pro: 42,
      consumer: "c1",
    });
    expect(Object.keys(search).sort()).toEqual(
      [
        "booking",
        "consumer",
        "disputed",
        "from",
        "page",
        "phone",
        "pro",
        "provider_id",
        "sp",
        "status",
        "to",
      ].sort(),
    );
    expect(Object.values(search).every((value) => value === undefined)).toBe(true);
  });

  it("keeps an exact SP and Pro id, lower-cased (SVC-427)", () => {
    const search = validateBookingsSearch({
      provider_id: BOOKING_ID.toUpperCase(),
      pro: BOOKING_ID,
    });
    expect(search.provider_id).toBe(BOOKING_ID);
    expect(search.pro).toBe(BOOKING_ID);
  });

  it("keeps an exact customer id, lower-cased (SVC-433)", () => {
    expect(validateBookingsSearch({ consumer: BOOKING_ID.toUpperCase() }).consumer).toBe(
      BOOKING_ID,
    );
  });

  it("reads a phone the router parsed into a number as the digits typed", () => {
    expect(validateBookingsSearch({ phone: 9876542501 }).phone).toBe("9876542501");
  });

  it("drops a page that isn't a whole number above 1", () => {
    expect(validateBookingsSearch({ page: 2.5 }).page).toBeUndefined();
    expect(validateBookingsSearch({ page: -4 }).page).toBeUndefined();
    expect(validateBookingsSearch({ page: "2" }).page).toBeUndefined();
  });
});

describe("bookingsListPath", () => {
  it("asks for page 1 of 25 with no filters", () => {
    expect(bookingsListPath({})).toBe("/admin/bookings?page=1&per_page=25");
  });

  it("maps each filter to the backend's name for it", () => {
    const path = bookingsListPath({
      status: "cancelled",
      disputed: true,
      from: "2026-11-01",
      to: "2026-11-07",
      phone: "+91 98765 42501",
      sp: "50% Off",
      page: 2,
    });
    const params = new URL(path, "http://x").searchParams;
    expect(Object.fromEntries(params)).toEqual({
      status: "cancelled",
      disputed: "true",
      created_from: "2026-11-01",
      created_to: "2026-11-07",
      consumer_phone: "+91 98765 42501",
      provider_name: "50% Off",
      page: "2",
      per_page: "25",
    });
  });

  it("never sends the open booking to the list", () => {
    expect(bookingsListPath({ booking: BOOKING_ID })).not.toContain(BOOKING_ID);
  });

  it("sends an exact SP and Pro as provider_id and professional_id (SVC-427)", () => {
    const params = new URL(
      bookingsListPath({ provider_id: "sp-1", pro: "pro-1", from: "2026-10-11" }),
      "http://x",
    ).searchParams;
    expect(params.get("provider_id")).toBe("sp-1");
    expect(params.get("professional_id")).toBe("pro-1");
    expect(params.get("created_from")).toBe("2026-10-11");
  });

  it("sends an exact customer as consumer_id, and counts it as a filter (SVC-433)", () => {
    const params = new URL(bookingsListPath({ consumer: "c-1" }), "http://x").searchParams;
    expect(params.get("consumer_id")).toBe("c-1");
    expect(hasFilters({ consumer: "c-1" })).toBe(true);
  });

  it("counts an exact SP or Pro as a filter, so Clear filters shows", () => {
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ provider_id: "sp-1" })).toBe(true);
    expect(hasFilters({ pro: "pro-1" })).toBe(true);
    expect(hasFilters({ booking: "b-1" })).toBe(false);
  });
});

describe("the booking-ID check", () => {
  it("takes a full UUID in either case", () => {
    expect(isUuid(BOOKING_ID)).toBe(true);
    expect(isUuid(BOOKING_ID.toUpperCase())).toBe(true);
  });

  it("refuses the short id the list shows, and anything else", () => {
    expect(isUuid(shortId(BOOKING_ID))).toBe(false);
    expect(isUuid(`${BOOKING_ID}x`)).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

describe("money", () => {
  it("charges the service amount, less the discount, plus the tip", () => {
    expect(totalCharged(booking())).toBe(1849);
  });

  it("never charges less than nothing", () => {
    expect(totalCharged({ service_amount: 100, discount_amount: 150, tip_amount: 0 })).toBe(0);
  });

  it("formats rupees the Indian way, with paise only when there are some", () => {
    expect(formatRupees(150000)).toBe("₹1,50,000");
    expect(formatRupees(299.85)).toBe("₹299.85");
    expect(formatRupees(299.5)).toBe("₹299.50");
  });

  it("works out pages from the total", () => {
    expect(lastPage(0)).toBe(1);
    expect(lastPage(25)).toBe(1);
    expect(lastPage(26)).toBe(2);
    expect(lastPage(60)).toBe(3);
  });
});

describe("force cancel", () => {
  it("is for admin and ops, not support", () => {
    expect(canForceCancel("admin")).toBe(true);
    expect(canForceCancel("ops")).toBe(true);
    expect(canForceCancel("support")).toBe(false);
  });

  it("is offered only for a booking that isn't finished", () => {
    for (const status of ["requested", "accepted", "en_route", "in_progress"]) {
      expect(isCancellable(status)).toBe(true);
    }
    for (const status of ["completed", "cancelled", "expired"]) {
      expect(isCancellable(status)).toBe(false);
    }
  });

  it("needs a trimmed reason of 1 to 500 characters", () => {
    expect(checkCancelReason("   ")).toEqual({ ok: false, message: "Enter a reason." });
    expect(checkCancelReason("  dup  ")).toEqual({ ok: true, reason: "dup" });
    expect(checkCancelReason("x".repeat(500)).ok).toBe(true);
    expect(checkCancelReason("x".repeat(501)).ok).toBe(false);
    expect(checkCancelReason(` ${"x".repeat(500)} `).ok).toBe(true);
  });

  it("says plainly that a job in progress gets no automatic refund", () => {
    expect(refundCopy(booking({ status: "in_progress" }))).toMatch(/no automatic refund/);
  });

  it("describes the refund the backend's cancel policy makes", () => {
    expect(refundCopy(booking({ status: "requested" }))).toBe(
      "The customer gets a full refund of ₹1,799.",
    );
    expect(refundCopy(booking({ status: "en_route" }))).toMatch(
      /₹1,799 back, less the cancellation fee/,
    );
    expect(refundCopy(booking({ payment_method: "cash" }))).toMatch(/no money moves/);
    expect(refundCopy(booking({ payment_status: "pending" }))).toMatch(/nothing to refund/);
  });
});

describe("the timeline", () => {
  it("names a status change by its two ends", () => {
    expect(timelineTitle(statusItem({ from_status: "en_route", to_status: "in_progress" }))).toBe(
      "En route → In progress",
    );
    expect(timelineProChange(statusItem())).toBeNull();
  });

  it("names an assignment by its kind and the Pros it moved between", () => {
    const item = assignmentItem({
      kind: "repicked",
      from_professional: { id: "p1", display_name: "Ramesh" },
      to_professional: { id: "p2", display_name: "Suresh" },
    });
    expect(timelineTitle(item)).toBe("Pro changed");
    expect(timelineProChange(item)).toBe("Ramesh → Suresh");
    expect(timelineProChange(assignmentItem({ kind: "declined", to_professional: null }))).toBe(
      "nobody → nobody",
    );
  });

  it("shows an unknown kind or status in words instead of dropping it", () => {
    expect(timelineTitle(assignmentItem({ kind: "swapped_out" }))).toBe("Swapped out");
    expect(timelineTitle(statusItem({ to_status: "on_hold" }))).toBe("Requested → On hold");
  });

  it("calls a missing actor the system", () => {
    expect(actorLabel(null, null)).toBe("System");
    expect(actorLabel("Asha", "u1")).toBe("Asha");
    expect(actorLabel(null, "u1")).toBe("Unnamed user");
  });

  it("formats times in IST, whatever the browser's zone", () => {
    expect(formatIst("2026-11-04T18:30:00Z")).toMatch(/5 Nov 2026.*12:00/);
    expect(formatIst("not a date")).toBe("not a date");
  });
});

describe("itemsSummary", () => {
  it("names the first item and counts the rest", () => {
    expect(itemsSummary(booking().items)).toBe("Deep Clean + 1 more");
    expect(itemsSummary(booking().items.slice(0, 1))).toBe("Deep Clean");
    expect(itemsSummary([])).toBe("No items");
  });
});
