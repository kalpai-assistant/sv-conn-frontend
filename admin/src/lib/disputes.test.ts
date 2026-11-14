import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  GATEWAY_ERROR_MESSAGE,
  canRefund,
  checkLogForm,
  checkResolveForm,
  confirmCopy,
  disputeErrorMessage,
  disputesListPath,
  isBookingNotFound,
  istDayEnd,
  istDayStart,
  resolvedNotice,
  validateRefundsSearch,
  type DisputeRefunds,
  type DisputeRow,
  type ResolveForm,
} from "@/lib/disputes";

const ONLINE: DisputeRefunds = {
  channel: "RAZORPAY",
  captured: 999,
  cancel_refund: 0,
  cancel_refund_id: null,
  cancel_refunded_at: null,
  dispute_refunds: 0,
  refundable: 999,
  support_refund_limit: 500,
};

const form = (overrides: Partial<ResolveForm> = {}): ResolveForm => ({
  resolution_type: "FULL_REFUND",
  amount: "",
  notes: "Pro never arrived",
  ...overrides,
});

describe("validateRefundsSearch", () => {
  it("keeps known values", () => {
    expect(
      validateRefundsSearch({
        status: "IN_REVIEW",
        reason: "NO_SHOW",
        from: "2026-11-01",
        to: "2026-11-10",
        page: 3,
      }),
    ).toEqual({
      status: "IN_REVIEW",
      reason: "NO_SHOW",
      from: "2026-11-01",
      to: "2026-11-10",
      page: 3,
    });
  });

  it("turns anything unknown into an explicit undefined", () => {
    const parsed = validateRefundsSearch({
      status: "raised",
      reason: "RUDE",
      from: "0202-11-01",
      to: "2026-11",
      page: 1,
    });
    expect(parsed).toEqual({
      status: undefined,
      reason: undefined,
      from: undefined,
      to: undefined,
      page: undefined,
    });
    expect(Object.keys(parsed)).toHaveLength(5);
  });

  it("drops a fractional or string page", () => {
    expect(validateRefundsSearch({ page: 2.5 }).page).toBeUndefined();
    expect(validateRefundsSearch({ page: "2" }).page).toBeUndefined();
  });
});

describe("disputesListPath", () => {
  it("asks for page 1 of 50 by default", () => {
    expect(disputesListPath({})).toBe("/admin/disputes?page=1&per_page=50");
  });

  it("sends IST days as UTC instants, the end exclusive", () => {
    expect(istDayStart("2026-11-10")).toBe("2026-11-09T18:30:00.000Z");
    expect(istDayEnd("2026-11-10")).toBe("2026-11-10T18:30:00.000Z");
    expect(
      disputesListPath({
        status: "RAISED",
        reason: "BILLING",
        from: "2026-11-01",
        to: "2026-11-10",
        page: 2,
      }),
    ).toBe(
      "/admin/disputes?status=RAISED&reason_code=BILLING" +
        "&date_from=2026-10-31T18%3A30%3A00.000Z&date_to=2026-11-10T18%3A30%3A00.000Z" +
        "&page=2&per_page=50",
    );
  });

  it("never sends a + or a half-typed year", () => {
    const path = disputesListPath({ from: "0002-01-01", to: "2026-12-31" });
    expect(path).not.toContain("+");
    expect(path).not.toContain("date_from");
    expect(path).toContain("date_to=2026-12-31T18%3A30%3A00.000Z");
  });
});

describe("checkLogForm", () => {
  it("trims the description and builds the body", () => {
    expect(checkLogForm({ reason_code: "QUALITY", description: "  Stains left  " }, "b1")).toEqual({
      ok: true,
      body: { booking_id: "b1", reason_code: "QUALITY", description: "Stains left" },
    });
  });

  it("needs a reason and a non-blank description of at most 2000 characters", () => {
    expect(checkLogForm({ reason_code: "", description: "   " }, "b1")).toEqual({
      ok: false,
      errors: { reason_code: "Pick a reason.", description: "Enter the customer's complaint." },
    });
    const long = checkLogForm({ reason_code: "OTHER", description: "x".repeat(2001) }, "b1");
    expect(long).toEqual({ ok: false, errors: { description: "At most 2000 characters." } });
  });
});

describe("checkResolveForm", () => {
  const admin = { refunds: ONLINE, role: "admin" as const };
  const support = { refunds: ONLINE, role: "support" as const };

  it("FULL sends the refundable amount the page loaded", () => {
    expect(checkResolveForm(form(), admin)).toEqual({
      ok: true,
      body: { resolution_type: "FULL_REFUND", refund_amount: 999, notes: "Pro never arrived" },
    });
  });

  it("NO_REFUND sends no refund_amount key at all", () => {
    const check = checkResolveForm(form({ resolution_type: "NO_REFUND", amount: "50" }), admin);
    expect(check.ok && check.body).toEqual({
      resolution_type: "NO_REFUND",
      notes: "Pro never arrived",
    });
    expect(check.ok && "refund_amount" in check.body).toBe(false);
  });

  it("PARTIAL needs an amount over 0, up to refundable, at most 2 decimals", () => {
    const partial = (amount: string) =>
      checkResolveForm(form({ resolution_type: "PARTIAL_REFUND", amount }), admin);
    expect(partial("")).toEqual({ ok: false, errors: { amount: "Enter the amount to refund." } });
    expect(partial("0")).toEqual({ ok: false, errors: { amount: "More than ₹0." } });
    expect(partial("1.005")).toEqual({
      ok: false,
      errors: { amount: "At most 2 decimal places." },
    });
    expect(partial("abc")).toEqual({ ok: false, errors: { amount: "Enter a number." } });
    expect(partial("999.01")).toEqual({
      ok: false,
      errors: { amount: "Only ₹999 is left to refund." },
    });
    expect(partial("₹ 249.50")).toEqual({
      ok: true,
      body: { resolution_type: "PARTIAL_REFUND", refund_amount: 249.5, notes: "Pro never arrived" },
    });
    expect(partial("999").ok).toBe(true);
  });

  it("caps support at support_refund_limit, full or partial; admin and ops are uncapped", () => {
    const cap =
      "Support can refund up to ₹500 per dispute. Ask an admin or ops to make this refund.";
    expect(checkResolveForm(form(), support)).toEqual({ ok: false, errors: { amount: cap } });
    expect(
      checkResolveForm(form({ resolution_type: "PARTIAL_REFUND", amount: "500.01" }), support),
    ).toEqual({ ok: false, errors: { amount: cap } });
    expect(
      checkResolveForm(form({ resolution_type: "PARTIAL_REFUND", amount: "500" }), support).ok,
    ).toBe(true);
    expect(checkResolveForm(form(), { refunds: ONLINE, role: "ops" }).ok).toBe(true);
    // No refund moves no money, so the cap doesn't apply.
    expect(checkResolveForm(form({ resolution_type: "NO_REFUND" }), support).ok).toBe(true);
  });

  it("requires notes, trimmed, at most 2000 characters", () => {
    expect(checkResolveForm(form({ notes: "  " }), admin)).toEqual({
      ok: false,
      errors: { notes: "Enter the notes." },
    });
    expect(checkResolveForm(form({ notes: "x".repeat(2001) }), admin)).toEqual({
      ok: false,
      errors: { notes: "At most 2000 characters." },
    });
  });

  it("allows only NO_REFUND when nothing is left or nothing was paid", () => {
    const spent = { ...ONLINE, refundable: 0 };
    const unpaid = { ...ONLINE, channel: null, refundable: 0 };
    expect(canRefund(spent)).toBe(false);
    expect(canRefund(unpaid)).toBe(false);
    expect(canRefund(ONLINE)).toBe(true);
    expect(checkResolveForm(form(), { refunds: spent, role: "admin" })).toEqual({
      ok: false,
      errors: {
        resolution_type: "Nothing is left to refund on this booking. Resolve it as No refund.",
      },
    });
  });
});

describe("confirmCopy", () => {
  it("names the amount, the channel and that it's final", () => {
    const body = { resolution_type: "PARTIAL_REFUND" as const, refund_amount: 250, notes: "n" };
    const online = confirmCopy(body, "RAZORPAY", "Asha");
    expect(online.title).toBe("Refund ₹250 through Razorpay?");
    expect(online.detail).toMatch(/Asha's original payment.*can't be undone/);
    const cash = confirmCopy(body, "MANUAL", "Asha");
    expect(cash.title).toBe("Record a ₹250 manual refund?");
    expect(cash.detail).toMatch(/app moves no money.*can't be undone/);
    const none = confirmCopy({ resolution_type: "NO_REFUND", notes: "n" }, "RAZORPAY", "Asha");
    expect(none.title).toBe("Close with no refund?");
    expect(none.detail).toMatch(/can't be undone/);
  });
});

describe("resolvedNotice", () => {
  const row = (overrides: Partial<DisputeRow>) =>
    ({ refund_amount: 250, ...overrides }) as DisputeRow;
  it("tells pending, processed, failed and manual apart", () => {
    expect(
      resolvedNotice(row({ refund_channel: "RAZORPAY", refund_status: "PENDING" })).text,
    ).toMatch(/pending until Razorpay confirms/);
    expect(
      resolvedNotice(row({ refund_channel: "RAZORPAY", refund_status: "PROCESSED" })).text,
    ).toBe("₹250 refunded through Razorpay. The dispute is closed.");
    expect(resolvedNotice(row({ refund_channel: "RAZORPAY", refund_status: "FAILED" })).kind).toBe(
      "error",
    );
    expect(resolvedNotice(row({ refund_channel: "MANUAL", refund_status: null })).text).toBe(
      "Manual refund of ₹250 recorded. The dispute is closed.",
    );
    expect(resolvedNotice(row({ refund_amount: null })).text).toBe("Closed with no refund.");
  });
});

describe("disputeErrorMessage", () => {
  const err = (status: number, code?: string, details?: Record<string, unknown>, message = "m") =>
    new ApiError(status, message, code, undefined, details);

  it("maps every backend code to plain words", () => {
    expect(disputeErrorMessage(err(404, "DISPUTE_NOT_FOUND"))).toMatch(/no longer exists/);
    expect(disputeErrorMessage(err(404, "BOOKING_NOT_FOUND"))).toBe("No booking with this ID.");
    expect(disputeErrorMessage(err(409, "DISPUTE_ALREADY_OPEN"))).toMatch(/already has an open/);
    expect(disputeErrorMessage(err(409, "DISPUTE_BOOKING_NOT_FINISHED"))).toMatch(
      /completed or cancelled/,
    );
    expect(disputeErrorMessage(err(409, "DISPUTE_INVALID_STATE"))).toMatch(/already moved/);
    expect(disputeErrorMessage(err(409, "NOTHING_TO_REFUND"))).toMatch(/Resolve it as No refund/);
    expect(
      disputeErrorMessage(err(422, "DISPUTE_INVALID", { field: "refund_amount", refundable: 749 })),
    ).toMatch(/refundable amount is now ₹749/);
    expect(
      disputeErrorMessage(
        err(422, "REFUND_REJECTED", { razorpay_error: "The id provided does not exist" }),
      ),
    ).toBe(
      "Razorpay refused the refund: The id provided does not exist. No money moved and the dispute is unchanged.",
    );
    expect(disputeErrorMessage(err(403, "REFUND_OVER_SUPPORT_LIMIT", { limit: 500 }))).toBe(
      "Support can refund up to ₹500 per dispute. Ask an admin or ops to make this refund.",
    );
  });

  it("says a 502 has an unknown outcome and that a retry is safe", () => {
    const text = disputeErrorMessage(err(502, "REFUND_GATEWAY_ERROR"));
    expect(text).toBe(GATEWAY_ERROR_MESSAGE);
    expect(text).toMatch(/may or may not have gone through/);
    expect(text).toMatch(/Razorpay dashboard/);
    expect(text).toMatch(/Retrying is safe/);
  });

  it("falls back without a code", () => {
    expect(disputeErrorMessage(err(403, undefined, undefined, "Requires role: admin"))).toBe(
      "Your role can't do this.",
    );
    expect(disputeErrorMessage(err(422))).toMatch(/didn't accept a value/);
    expect(disputeErrorMessage(err(502))).toMatch(/Reload the page/);
    expect(disputeErrorMessage(new TypeError("Failed to fetch"))).toMatch(/Reload the page/);
  });

  it("reads a codeless 422 and a 404 on the detail as booking not found", () => {
    expect(isBookingNotFound(err(404, "BOOKING_NOT_FOUND"))).toBe(true);
    expect(isBookingNotFound(err(422))).toBe(true);
    expect(isBookingNotFound(err(422, "DISPUTE_INVALID"))).toBe(false);
    expect(isBookingNotFound(err(500))).toBe(false);
  });
});
