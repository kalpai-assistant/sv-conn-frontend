/**
 * The money formatter's contract (SVC-297).
 *
 * This module governs every rupee the app renders and had no tests at all,
 * which is how ~27 screens ended up hand-rolling their own formatting and
 * Wall painting came out as "₹598.4" instead of "₹598.40".
 *
 * Two rules matter here and neither is obvious from reading the code:
 *
 * 1. Whole rupees render clean, fractional ones pad to two places. Verified
 *    against the live catalogue before settling on it: 363 services and 516
 *    variants, *zero* fractional prices. Forcing ".00" everywhere would add
 *    noise to 879 real prices to tidy figures that only arise from a per-sq-ft
 *    test service.
 *
 * 2. `formatPaise` and `formatRupees` are NOT interchangeable. Passing paise to
 *    the rupee formatter renders 100× too large — on a screen that moves real
 *    money. The unit belongs to the field, not the formatter, and every
 *    paise-denominated field in the API is named `*_paise`.
 */
import { describe, expect, it } from "vitest";
import { formatPaise, formatRupees } from "@/lib/currency";

describe("formatRupees", () => {
  it("pads a fractional amount to two places", () => {
    // The reported bug. ₹598.40 is what the database holds — Numeric(12,2),
    // quantized server-side — and the trailing zero was being dropped at
    // render time by toLocaleString, which sets no minimum.
    expect(formatRupees(598.4)).toBe("₹598.40");
  });

  it("leaves a whole amount clean", () => {
    // Not "₹499.00". Almost the entire catalogue is whole rupees, so forcing
    // decimals would make every service card noisier to fix one that isn't.
    expect(formatRupees(499)).toBe("₹499");
  });

  it.each([
    [5.6, "₹5.60"],
    [1.4, "₹1.40"],
    [0.8, "₹0.80"],
    [0.2, "₹0.20"],
  ])("pads %s to %s", (input, expected) => {
    // Real values from a booking of the per-sq-ft service: 7 × ₹1.00 gives a
    // ₹1.40 commission and a ₹5.60 payout. The payout is provider-facing money
    // and renders on their job list, so this is not a cosmetic case.
    expect(formatRupees(input)).toBe(expected);
  });

  it("groups the Indian way, not the American way", () => {
    // ₹10,00,000 and not ₹1,000,000. The two spellings are identical below
    // ₹1,00,000, which is exactly why a wrong locale survives review by eye —
    // no test data under a lakh can catch it.
    expect(formatRupees(1000000)).toBe("₹10,00,000");
  });

  it("keeps two places at most", () => {
    // toLocaleString defaults to three. A third decimal on money is never
    // meaningful and would not match the stored value.
    expect(formatRupees(12.345)).toBe("₹12.35");
  });

  it("renders zero as a whole amount", () => {
    expect(formatRupees(0)).toBe("₹0");
  });

  describe("withSymbol: false", () => {
    // Opt-out exists so a surface composing its own prefix (SVC-384 renders
    // the discount line as `(−₹100)`) can get the grouped digits without a
    // leading ₹. The default stays on so the SVC-297 lint keeps shouting at
    // hand-rolled `₹{...}` interpolation elsewhere.

    it("strips the symbol", () => {
      expect(formatRupees(100000, { withSymbol: false })).toBe("1,00,000");
    });

    it("still groups the Indian way", () => {
      expect(formatRupees(1000000, { withSymbol: false })).toBe("10,00,000");
    });

    it("still pads fractionals", () => {
      expect(formatRupees(598.4, { withSymbol: false })).toBe("598.40");
    });

    it("defaults to withSymbol: true", () => {
      // Pins the default so a future refactor cannot flip it silently and
      // de-symbol every price on every screen.
      expect(formatRupees(499, {})).toBe(formatRupees(499));
      expect(formatRupees(499)).toBe("₹499");
    });
  });
});

describe("formatPaise", () => {
  it("converts from paise", () => {
    expect(formatPaise(2400000)).toBe("₹24,000");
  });

  it("keeps a genuine paise remainder", () => {
    expect(formatPaise(59840)).toBe("₹598.40");
  });

  it("is not interchangeable with formatRupees", () => {
    // The 100× trap, pinned deliberately. The same integer means two different
    // amounts depending on the field it came from, and only the field name
    // (`*_paise`) says which.
    expect(formatPaise(49900)).toBe("₹499");
    expect(formatRupees(49900)).toBe("₹49,900");
  });
});
