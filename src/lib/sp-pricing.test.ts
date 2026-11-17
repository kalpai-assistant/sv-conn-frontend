/**
 * The SP pricing maths (SVC-412). The preview must agree with the backend's
 * `commission.take_home` to the paisa, and the range test must agree with
 * `price_range.is_outside_range` on the bounds themselves.
 */
import { describe, expect, it } from "vitest";
import {
  displayRange,
  isOutsideRange,
  parsePrice,
  previewTakeHome,
  priceText,
} from "@/lib/sp-pricing";

describe("parsePrice", () => {
  it.each([
    ["950", 95000],
    [" 950 ", 95000],
    ["950.5", 95050],
    ["950.55", 95055],
    ["0.01", 1],
    ["00950", 95000],
    ["9999999999", 999999999900], // 10 whole digits: Numeric(12, 2)'s maximum
  ])("%j is %d paise", (text, paise) => {
    expect(parsePrice(text)).toEqual({ ok: true, paise });
  });

  it.each(["", "0", "0.00", "-5", "950.555", "950.", ".5", "1e3", "9,500", "abc", "12345678901"])(
    "%j is not a price",
    (text) => {
      expect(parsePrice(text)).toEqual({ ok: false });
    },
  );
});

describe("previewTakeHome", () => {
  it("₹2,000 on the ₹2,499 / ₹750 variant → ₹600.24 + ₹108.04 GST → ₹1,291.72", () => {
    // commission_pct as the server sends it: 750 / 2499 × 100, unrounded.
    const pct = (750 * 100) / 2499;
    expect(pct).toBeCloseTo(30.012, 3);
    expect(previewTakeHome(200000, pct, 18)).toEqual({
      commission: 60024,
      gst: 10804,
      receives: 129172,
    });
  });

  it("rounds half up, as ROUND_HALF_UP does", () => {
    // 25 paise × 10% = 2.5 paise → 3; GST 18% of 3 = 0.54 → 1.
    expect(previewTakeHome(25, 10, 18)).toEqual({ commission: 3, gst: 1, receives: 21 });
  });
});

describe("isOutsideRange", () => {
  const range = { low: 749.25, high: 1248.75 };

  it("keeps both bounds inside", () => {
    expect(isOutsideRange(74925, range)).toBe(false);
    expect(isOutsideRange(124875, range)).toBe(false);
    expect(isOutsideRange(74924, range)).toBe(true);
    expect(isOutsideRange(124876, range)).toBe(true);
  });

  it("tests against the exact bound, never one rounded to paise", () => {
    // 1248.875 rounds to 1248.88 in paise, which would wrongly keep it inside.
    expect(isOutsideRange(124888, { low: 1, high: 1248.875 })).toBe(true);
    expect(isOutsideRange(124887, { low: 1, high: 1248.875 })).toBe(false);
  });

  it("never flags a variant without a range", () => {
    expect(isOutsideRange(1, null)).toBe(false);
  });
});

describe("displayRange", () => {
  it("rounds the low bound up and the high bound down", () => {
    expect(displayRange({ low: 749.25, high: 1248.75 })).toEqual({ low: 750, high: 1248 });
    expect(displayRange({ low: 749, high: 1249 })).toEqual({ low: 749, high: 1249 });
  });
});

describe("priceText", () => {
  it("shows a saved price as the box should hold it", () => {
    expect(priceText(950)).toBe("950");
    expect(priceText(950.5)).toBe("950.50");
    expect(priceText(null)).toBe("");
  });
});
