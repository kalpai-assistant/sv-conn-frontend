/**
 * The payout-state mapping (SVC-303).
 *
 * Every case here is a way the app could lie to a provider about money:
 *
 * - a cash job labelled "Paid" implies a bank transfer that never happened;
 * - a cash job labelled "Awaiting payout" promises money that will never come,
 *   because the provider already collected it at the door;
 * - `reversed` collapsed into `failed` tells someone money never arrived when
 *   they watched it arrive and leave again.
 *
 * The mapping is a pair, `(payment_method, settlement_status)`, not a switch on
 * one field — which is exactly why it lives in a module with tests rather than
 * inline at a call site.
 */
import { describe, expect, it } from "vitest";

import { payoutState } from "@/lib/payout-status";

describe("cash", () => {
  it("is its own state, never a variant of paid", () => {
    const state = payoutState("cash", "pending");

    expect(state?.key).toBe("cash");
    expect(state?.label).toBe("Collected in cash");
  });

  it("wins over the settlement status, whatever that column happens to hold", () => {
    // A cash booking never enters the payout path, so its settlement_status is
    // just the column default. Reading it would label the job "Awaiting
    // payout" — money the provider will never receive, because they have it.
    for (const status of ["pending", "processing", "completed", "failed", "reversed"] as const) {
      expect(payoutState("cash", status)?.key).toBe("cash");
    }
  });

  it("is quiet, not an alert — nothing has gone wrong", () => {
    expect(payoutState("cash", "pending")?.severity).toBe("quiet");
  });
});

describe("the online settlement states", () => {
  it("maps each of the five to its own reading", () => {
    expect(payoutState("online", "pending")?.key).toBe("awaiting");
    expect(payoutState("online", "processing")?.key).toBe("processing");
    expect(payoutState("online", "completed")?.key).toBe("paid");
    expect(payoutState("online", "failed")?.key).toBe("failed");
    expect(payoutState("online", "reversed")?.key).toBe("reversed");
  });

  it("keeps reversed distinct from failed", () => {
    // The provider *saw this money arrive*. Calling it a failure would
    // contradict their own bank statement.
    const failed = payoutState("online", "failed");
    const reversed = payoutState("online", "reversed");

    expect(failed?.key).not.toBe(reversed?.key);
    expect(failed?.label).not.toBe(reversed?.label);
  });

  it("separates awaiting from in-progress", () => {
    // Sent to the bank versus not sent at all — the difference matters to
    // someone watching for money to land.
    expect(payoutState("online", "pending")?.label).toMatch(/awaiting/i);
    expect(payoutState("online", "processing")?.label).toMatch(/progress/i);
  });

  it("carries no date on paid", () => {
    // A per-job paid date would need a join that duplicates rows and doubles
    // the window total. The dates live on the Payouts screen, per cycle.
    expect(payoutState("online", "completed")?.label).toBe("Paid");
  });
});

describe("severity", () => {
  it("raises only the two that need the provider to act", () => {
    expect(payoutState("online", "failed")?.severity).toBe("alert");
    expect(payoutState("online", "reversed")?.severity).toBe("alert");
  });

  it("leaves the steady states quiet", () => {
    expect(payoutState("online", "pending")?.severity).toBe("quiet");
    expect(payoutState("online", "processing")?.severity).toBe("quiet");
    expect(payoutState("online", "completed")?.severity).toBe("quiet");
  });
});

describe("when there is nothing to say", () => {
  it("returns null rather than guessing", () => {
    // A booking from before these columns existed. An unlabelled row beats a
    // guessed label on a screen about money.
    expect(payoutState("online", null)).toBeNull();
    expect(payoutState(null, null)).toBeNull();
    expect(payoutState(undefined, undefined)).toBeNull();
  });

  it("still reads cash even with no settlement status", () => {
    expect(payoutState("cash", null)?.key).toBe("cash");
  });
});
