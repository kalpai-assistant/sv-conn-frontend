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
import { cancelledPaymentLine, paymentStatusLabel, paymentStatusTone } from "@/lib/payment-status";

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

describe("cancelled-booking money line", () => {
  // It used to say "You have not been charged" for every cancellation, which
  // is false for a paid booking refunded by the SVC-344 no-taker sweep.
  it.each(["pending", "expired"])("says not charged for an online booking that was %s", (s) => {
    expect(cancelledPaymentLine(s, "online")).toBe("You have not been charged.");
  });

  it.each(ALL_STATUSES)("says not charged for cash, whatever the status (%s)", (s) => {
    expect(cancelledPaymentLine(s, "cash")).toBe("You have not been charged.");
  });

  it("reports a refund in progress or done, never 'not charged'", () => {
    expect(cancelledPaymentLine("refund_processing", "online")).toMatch(/refund has been started/);
    expect(cancelledPaymentLine("refunded", "online")).toMatch(/refund has been issued/);
    expect(cancelledPaymentLine("refund_failed", "online")).toMatch(/delayed/);
  });

  it("stays neutral for a paid booking whose refund hasn't started", () => {
    expect(cancelledPaymentLine("paid", "online")).toMatch(/payment details below/);
  });

  it("never states an amount or calls a refund full", () => {
    // The payload has no refund amount, and a post-accept cancel keeps a fee.
    for (const s of [...ALL_STATUSES, "something_new"]) {
      const line = cancelledPaymentLine(s, "online");
      expect(line).not.toMatch(/₹|\d|full/i);
    }
  });

  it("does not claim 'not charged' for a status it doesn't know", () => {
    expect(cancelledPaymentLine("something_new", "online")).not.toMatch(/not been charged/);
  });
});
