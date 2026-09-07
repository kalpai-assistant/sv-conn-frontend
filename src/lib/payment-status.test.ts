/**
 * Payment status wording on the tracking screen (SVC-259).
 *
 * The panel showed the method and the amount but never whether the money had
 * actually moved. You inferred "paid" from the *absence* of the Pay Now button
 * below — a weak signal on a good day, and simply wrong on a bad one: that
 * button is suppressed for CANCELLED and EXPIRED regardless of payment, so an
 * expired booking looked identical whether or not it had been charged. That is
 * exactly why an expired ₹2,999 booking could not be told apart from an unpaid
 * one during testing.
 *
 * `payment_status` has six values, three of them about refunds. The thing to
 * protect against is the raw enum reaching a consumer's receipt — nobody
 * should be reading `refund_processing` off their own booking.
 */
import { describe, expect, it } from "vitest";
import { paymentStatusLabel, paymentStatusTone } from "@/lib/payment-status";

const ALL_STATUSES = [
  "pending",
  "paid",
  "refunded",
  "expired",
  "refund_processing",
  "refund_failed",
] as const;

describe("labels", () => {
  it("names each state in words a consumer would use", () => {
    expect(paymentStatusLabel("paid")).toBe("Paid");
    expect(paymentStatusLabel("refunded")).toBe("Refunded");
    expect(paymentStatusLabel("pending")).toBe("Payment pending");
  });

  it("never renders a raw enum value", () => {
    // The whole point: `refund_processing` on a receipt is a leak of our
    // internals into someone's payment record.
    for (const status of ALL_STATUSES) {
      const label = paymentStatusLabel(status);
      expect(label).not.toContain("_");
      expect(label).not.toBe(status);
    }
  });

  it("does not blame the user for a refund we failed to send", () => {
    // "Failed" reads as something the consumer did or must fix. A failed
    // refund is ours to chase.
    expect(paymentStatusLabel("refund_failed")).not.toMatch(/failed/i);
  });

  it("says an expired booking was not paid, rather than leaving it ambiguous", () => {
    expect(paymentStatusLabel("expired")).toBe("Not paid");
  });

  it("falls back to pending for anything unrecognised", () => {
    // A new backend state must not render blank on a stale client.
    expect(paymentStatusLabel("something_new")).toBe("Payment pending");
  });
});

describe("tone", () => {
  it("is green only where money reached somewhere it should be", () => {
    expect(paymentStatusTone("paid")).toContain("success");
    expect(paymentStatusTone("refunded")).toContain("success");
  });

  it("does not colour a pending payment as a problem", () => {
    // Nothing has gone wrong — the user simply has not paid yet.
    expect(paymentStatusTone("pending")).not.toContain("destructive");
    expect(paymentStatusTone("pending")).not.toContain("success");
  });

  it("flags a failed refund, which is the one state needing attention", () => {
    expect(paymentStatusTone("refund_failed")).toContain("destructive");
  });

  it("does not paint an expired booking green", () => {
    expect(paymentStatusTone("expired")).not.toContain("success");
  });
});
