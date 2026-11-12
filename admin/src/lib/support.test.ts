import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  LOOKUP_MAX,
  NOTE_MAX,
  adminRoleLabel,
  checkLookupQuery,
  checkNote,
  customerPath,
  directBookingHit,
  interpretedLabel,
  lookupPath,
  lookupTotal,
  noteAuthorLabel,
  noteErrorText,
  notesPath,
  reassignErrorText,
  refusalLabel,
  retryErrorText,
  retrySuccessText,
  validateSupportSearch,
  type LookupResponse,
} from "@/lib/support";

const ID = "4d1dd8c9-09c1-4c17-a0f2-b0091a9edda2";

function lookup(overrides: Partial<LookupResponse> = {}): LookupResponse {
  return {
    query: "x",
    interpreted_as: [],
    customers: [],
    providers: [],
    pros: [],
    bookings: [],
    truncated: [],
    ...overrides,
  };
}

const booking = (id: string) => ({
  id,
  status: "requested",
  created_at: "2026-11-12T06:30:00Z",
  scheduled_at: null,
  service_summary: "Deep Clean",
  consumer_name: null,
  consumer_phone: null,
  provider_name: null,
  matched_by: "booking_id",
});

const conflict = (code: string, details?: Record<string, unknown>) =>
  new ApiError(409, `backend says ${code}`, code, undefined, details);

describe("validateSupportSearch", () => {
  it("keeps a query, an open customer and an open booking", () => {
    expect(
      validateSupportSearch({ q: "  98765 43301 ", customer: ID.toUpperCase(), booking: ID }),
    ).toEqual({ q: "98765 43301", customer: ID, booking: ID });
  });

  it("reads a phone the router parsed into a number as the digits typed", () => {
    expect(validateSupportSearch({ q: 9876543301 }).q).toBe("9876543301");
  });

  it("sets every bad value to undefined, because the router merges the raw URL back in", () => {
    const search = validateSupportSearch({ q: "   ", customer: "c1", booking: 42 });
    expect(Object.keys(search).sort()).toEqual(["booking", "customer", "q"]);
    expect(Object.values(search).every((value) => value === undefined)).toBe(true);
  });

  it("cuts an over-long query to what the backend accepts", () => {
    expect(validateSupportSearch({ q: "a".repeat(150) }).q).toHaveLength(LOOKUP_MAX);
  });
});

describe("the lookup query", () => {
  it("needs at least 3 characters once trimmed", () => {
    expect(checkLookupQuery(" ab ").ok).toBe(false);
    expect(checkLookupQuery(" abc ")).toEqual({ ok: true, query: "abc" });
  });

  it("refuses more than 100 characters", () => {
    expect(checkLookupQuery("a".repeat(LOOKUP_MAX + 1)).ok).toBe(false);
  });

  it("sends the query encoded, and nothing for one the backend would refuse", () => {
    expect(lookupPath("+91 98765 43301")).toBe("/admin/support/lookup?q=%2B91+98765+43301");
    expect(lookupPath("ab")).toBeNull();
    expect(lookupPath(undefined)).toBeNull();
  });

  it("builds the customer and notes paths", () => {
    expect(customerPath(ID)).toBe(`/admin/support/customers/${ID}`);
    expect(notesPath(ID)).toBe(`/admin/bookings/${ID}/notes`);
  });
});

describe("reading a lookup", () => {
  it("names each way the query was read, and passes an unknown one through", () => {
    expect(interpretedLabel("phone")).toBe("phone number");
    expect(interpretedLabel("booking_id_suffix")).toBe("end of a booking ID");
    expect(interpretedLabel("email_address")).toBe("email address");
  });

  it("counts every kind of result", () => {
    expect(lookupTotal(lookup({ bookings: [booking(ID)], truncated: ["bookings"] }))).toBe(1);
  });

  it("jumps straight to a booking found by its full ID", () => {
    expect(
      directBookingHit(lookup({ interpreted_as: ["booking_id"], bookings: [booking(ID)] })),
    ).toBe(ID);
  });

  it("doesn't jump for an ID suffix, or when anything else matched too", () => {
    expect(
      directBookingHit(lookup({ interpreted_as: ["booking_id_suffix"], bookings: [booking(ID)] })),
    ).toBeNull();
    expect(
      directBookingHit(
        lookup({
          interpreted_as: ["booking_id_suffix", "name"],
          bookings: [booking(ID), booking("other")],
        }),
      ),
    ).toBeNull();
    expect(directBookingHit(lookup({ interpreted_as: ["booking_id"] }))).toBeNull();
  });
});

describe("notes", () => {
  it("names the author by name, then email", () => {
    const author = { user_id: "u1", name: null, email: "ops433@kalpai.in", admin_role: "ops" };
    expect(noteAuthorLabel({ ...author, name: "Meera" })).toBe("Meera");
    expect(noteAuthorLabel(author)).toBe("ops433@kalpai.in");
    expect(noteAuthorLabel({ ...author, email: null, name: "  " })).toBe("Unnamed admin");
  });

  it("labels each admin role", () => {
    expect(adminRoleLabel("support")).toBe("Support");
    expect(adminRoleLabel(null)).toBeNull();
  });

  it("refuses an empty or over-long note before sending it", () => {
    expect(checkNote("  \n ")).toEqual({ ok: false, message: "Write something first." });
    expect(checkNote("x".repeat(NOTE_MAX + 1)).ok).toBe(false);
    expect(checkNote("  called back  ")).toEqual({ ok: true, body: "called back" });
  });

  it("words the backend's refusals", () => {
    expect(noteErrorText(new ApiError(422, "x", "NOTE_EMPTY"), "note")).toBe(
      "Write something first.",
    );
    expect(noteErrorText(new ApiError(500, "boom"), "contacted")).toMatch(
      /Couldn't mark this as contacted/,
    );
    expect(noteErrorText(new TypeError("offline"), "note")).toMatch(/Couldn't save the note/);
  });
});

describe("retry dispatch", () => {
  it("says who it was sent to and when the new offer expires, in IST", () => {
    const result = {
      booking_id: ID,
      status: "requested",
      recipients: 3,
      retried_at: "2026-11-12T10:00:00Z",
      offer_expires_at: "2026-11-12T10:12:00Z",
    };
    expect(retrySuccessText(result)).toBe(
      "Sent to 3 providers. The new offer expires at 3:42 pm IST.",
    );
    expect(retrySuccessText({ ...result, recipients: 1 })).toMatch(/^Sent to 1 provider\./);
  });

  it("words each 409 code", () => {
    expect(retryErrorText(conflict("BOOKING_NOT_REQUESTED"))).toMatch(/isn't waiting/);
    expect(retryErrorText(conflict("DISPATCH_RETRY_TOO_SOON", { retry_after_seconds: 27 }))).toBe(
      "Dispatch was retried a moment ago. Try again in 27 seconds.",
    );
    expect(retryErrorText(conflict("DISPATCH_RETRY_TOO_SOON"))).toMatch(/in a minute\.$/);
  });

  it("words every funnel reason the backend sends", () => {
    const reasons = [
      "no_provider_covers_services",
      "none_kyc_verified",
      "none_account_active",
      "none_has_push_token",
      "none_online",
      "none_in_service_area",
      "none_has_someone_to_do_it",
      "all_already_answered",
      "unknown",
      "no-address-location",
      "empty-cart",
    ];
    for (const reason of reasons) {
      expect(retryErrorText(conflict("NO_ELIGIBLE_PROVIDERS", { reason }))).toMatch(
        /^No provider can take this booking right now: \S/,
      );
    }
    expect(
      retryErrorText(conflict("NO_ELIGIBLE_PROVIDERS", { reason: "no_provider_covers_services" })),
    ).toBe(
      "No provider can take this booking right now: no provider offers everything in this booking.",
    );
  });

  it("falls back to the backend's message for a reason or code it doesn't know", () => {
    expect(retryErrorText(conflict("NO_ELIGIBLE_PROVIDERS", { reason: "new_stage" }))).toBe(
      "backend says NO_ELIGIBLE_PROVIDERS",
    );
    expect(retryErrorText(conflict("SOMETHING_NEW"))).toBe("backend says SOMETHING_NEW");
    expect(retryErrorText(new ApiError(503, "infra"))).toMatch(/Please try again/);
  });
});

describe("reassign Pro", () => {
  it("words each refusal a Pro can carry", () => {
    expect(refusalLabel("PRO_OFFLINE")).toBe("Offline");
    expect(refusalLabel("PRO_BUSY")).toBe("On another job");
    expect(refusalLabel("PRO_DECLINED_THIS_BOOKING")).toBe("Declined this booking");
    expect(refusalLabel("SELF_NOT_TAKING_JOBS")).toBe("Owner isn't taking jobs");
    expect(refusalLabel("PRO_KYC_INCOMPLETE")).toBe("KYC not complete");
    expect(refusalLabel("SOME_NEW_CODE")).toBe("some new code");
    expect(refusalLabel(null)).toBe("Not available");
  });

  it("words a refused reassign", () => {
    expect(reassignErrorText(conflict("BOOKING_NOT_REASSIGNABLE"))).toBe(
      "Only an accepted booking can change Pro.",
    );
    expect(reassignErrorText(new ApiError(404, "x", "PRO_NOT_FOUND"))).toBe(
      "That Pro is no longer on this team.",
    );
    expect(reassignErrorText(conflict("PRO_BUSY"))).toBe("Can't assign this Pro: on another job.");
    expect(reassignErrorText(conflict("SOMETHING_NEW"))).toBe("backend says SOMETHING_NEW");
  });
});
