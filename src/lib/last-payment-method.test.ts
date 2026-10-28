/**
 * The one-field payment-method memory (SVC-385).
 *
 * Three invariants are worth pinning:
 *   1. Round-trips the two legal values; nothing else.
 *   2. Rejects garbage from an older schema or a half-written entry — returns
 *      `null` rather than letting a stray string reach the cart's state setter.
 *   3. Uses the `sc_` prefix. SVC-350's logout teardown sweeps every `sc_*`
 *      key, so a mis-prefixed key would leak the previous user's preference
 *      into a shared device after logout/login.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readLastPaymentMethod, writeLastPaymentMethod } from "@/lib/last-payment-method";

afterEach(() => {
  localStorage.clear();
});

describe("read/write round-trip", () => {
  it("round-trips 'online'", () => {
    writeLastPaymentMethod("online");
    expect(readLastPaymentMethod()).toBe("online");
  });

  it("round-trips 'cash'", () => {
    writeLastPaymentMethod("cash");
    expect(readLastPaymentMethod()).toBe("cash");
  });

  it("returns null when nothing is stored (fresh install / post-logout sweep)", () => {
    expect(readLastPaymentMethod()).toBeNull();
  });
});

describe("defensive reads", () => {
  it("returns null for a value that is not one of the two legal methods", () => {
    // Someone pokes the key by hand, or a future schema change writes a
    // widened enum; the cart's state setter is typed to the two legal values
    // and we must not hand it a third.
    localStorage.setItem("sc_last_payment_method", "upi");
    expect(readLastPaymentMethod()).toBeNull();
  });
});

describe("sc_ prefix (SVC-350 teardown contract)", () => {
  it("writes under a key SVC-350's logout sweep will pick up", () => {
    // The sweep is `localStorage.key(i).startsWith("sc_")` — if this helper
    // ever drops the prefix, logout would stop clearing the memory and a
    // shared device would leak one user's preference into the next session.
    writeLastPaymentMethod("cash");
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    expect(keys.every((k) => k.startsWith("sc_"))).toBe(true);
  });
});
