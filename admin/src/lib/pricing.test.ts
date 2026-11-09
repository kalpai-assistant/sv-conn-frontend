import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  affectedFields,
  applyPatch,
  canEditPricing,
  cellPayload,
  changesRow,
  errorField,
  formatCell,
  groupCategories,
  parseCell,
  parseWeight,
  parseWholeNumber,
  pricingErrorMessage,
  readWeights,
  sensitivePayload,
  weightSum,
  weightsSumOk,
  type CategoryPricingRow,
} from "@/lib/pricing";

function category(overrides: Partial<CategoryPricingRow> = {}): CategoryPricingRow {
  return {
    id: "c1",
    name: "AC servicing",
    slug: "ac-servicing",
    parent_id: "p1",
    parent_name: "Appliances",
    sort_order: 0,
    is_active: true,
    is_sensitive: false,
    reference_price: 499,
    bounds_pct: null,
    platform_commission_pct: 20,
    platform_commission_min: 30,
    commission_gst_pct: 18,
    ...overrides,
  };
}

describe("the weight sum", () => {
  const weights = (rating: number) => ({
    rating,
    price_vs_ref: 0.25,
    distance: 0.2,
    reliability: 0.15,
    activity: 0.05,
  });

  it("accepts 1.00 ± 0.01, float noise included", () => {
    expect(weightsSumOk(weightSum(weights(0.35)))).toBe(true);
    expect(weightsSumOk(weightSum(weights(0.34)))).toBe(true); // 0.99
    expect(weightsSumOk(weightSum(weights(0.36)))).toBe(true); // 1.01
  });

  it("refuses 0.98 and 1.02", () => {
    expect(weightsSumOk(weightSum(weights(0.33)))).toBe(false);
    expect(weightsSumOk(weightSum(weights(0.37)))).toBe(false);
  });

  it("counts a missing weight as 0", () => {
    expect(weightSum({ ...weights(0.35), rating: null })).toBeCloseTo(0.65);
  });

  it("parses a weight from 0 to 1 only", () => {
    expect(parseWeight("0.35")).toBe(0.35);
    expect(parseWeight(".5")).toBe(0.5);
    expect(parseWeight("1")).toBe(1);
    expect(parseWeight("0")).toBe(0);
    expect(parseWeight("1.01")).toBeNull();
    expect(parseWeight("-0.1")).toBeNull();
    expect(parseWeight("")).toBeNull();
    expect(parseWeight("abc")).toBeNull();
  });

  it("reads the stored weights only when all five are numbers", () => {
    expect(readWeights(weights(0.35))).toEqual(weights(0.35));
    expect(readWeights({ ...weights(0.35), rating: "0.35" })).toBeNull();
    expect(readWeights({ rating: 1 })).toBeNull();
    expect(readWeights(null)).toBeNull();
  });
});

describe("the boost window and TTL", () => {
  it("are whole numbers greater than 0", () => {
    expect(parseWholeNumber("14")).toBe(14);
    expect(parseWholeNumber("1,200")).toBe(1200);
    expect(parseWholeNumber("0")).toBeNull();
    expect(parseWholeNumber("1.5")).toBeNull();
    expect(parseWholeNumber("-3")).toBeNull();
    expect(parseWholeNumber("2147483648")).toBeNull();
  });
});

describe("the role check", () => {
  it("lets admin and ops edit, and support only read", () => {
    expect(canEditPricing("admin")).toBe(true);
    expect(canEditPricing("ops")).toBe(true);
    expect(canEditPricing("support")).toBe(false);
  });
});

describe("the sensitive toggle's payload", () => {
  it("turning it on sends the bounds in the same PATCH", () => {
    expect(sensitivePayload(true, 25)).toEqual({ is_sensitive: true, bounds_pct: 25 });
  });

  it("turning it off sends only the flag, and clears bounds in the optimistic row", () => {
    const patch = sensitivePayload(false);
    expect(patch).toEqual({ is_sensitive: false });
    expect(affectedFields(patch)).toEqual(["is_sensitive", "bounds_pct"]);
    const row = category({ is_sensitive: true, bounds_pct: 25 });
    expect(applyPatch(row, patch)).toMatchObject({ is_sensitive: false, bounds_pct: null });
  });

  it("a number cell sends just its own field; an empty reference price sends null", () => {
    expect(cellPayload("platform_commission_pct", 22)).toEqual({ platform_commission_pct: 22 });
    expect(cellPayload("reference_price", null)).toEqual({ reference_price: null });
  });

  it("knows a no-change save", () => {
    const row = category();
    expect(changesRow(row, { platform_commission_pct: 20 })).toBe(false);
    expect(changesRow(row, { platform_commission_pct: 21 })).toBe(true);
    expect(changesRow(row, sensitivePayload(false))).toBe(false);
  });
});

describe("a typed cell", () => {
  it("accepts the value as the table shows it", () => {
    expect(parseCell("reference_price", "₹1,499")).toEqual({ ok: true, value: 1499 });
    expect(parseCell("bounds_pct", "±25%")).toEqual({ ok: true, value: 25 });
    expect(parseCell("commission_gst_pct", "18.5")).toEqual({ ok: true, value: 18.5 });
  });

  it("an empty reference price is null; other empties are refused", () => {
    expect(parseCell("reference_price", "  ")).toEqual({ ok: true, value: null });
    expect(parseCell("bounds_pct", "").ok).toBe(false);
    expect(parseCell("platform_commission_min", "").ok).toBe(false);
  });

  it("mirrors the backend's ranges and 2 decimal places", () => {
    expect(parseCell("reference_price", "0").ok).toBe(false);
    expect(parseCell("platform_commission_min", "0")).toEqual({ ok: true, value: 0 });
    expect(parseCell("platform_commission_pct", "100")).toEqual({ ok: true, value: 100 });
    expect(parseCell("platform_commission_pct", "100.01").ok).toBe(false);
    expect(parseCell("bounds_pct", "0").ok).toBe(false);
    expect(parseCell("bounds_pct", "100")).toEqual({ ok: true, value: 100 });
    expect(parseCell("commission_gst_pct", "18.555")).toEqual({
      ok: false,
      error: "At most 2 decimal places.",
    });
    expect(parseCell("commission_gst_pct", "-1").ok).toBe(false);
    expect(parseCell("commission_gst_pct", "abc").ok).toBe(false);
  });

  it("shows rupees, percents and the bounds' ±", () => {
    expect(formatCell("reference_price", 1499)).toBe("₹1,499");
    expect(formatCell("reference_price", null)).toBe("—");
    expect(formatCell("bounds_pct", 25)).toBe("±25%");
    expect(formatCell("platform_commission_pct", 22.5)).toBe("22.5%");
  });
});

describe("the category list", () => {
  it("an L1 with children is a group; a childless L1 and every L2 are rows", () => {
    const rows = [
      category({ id: "p1", name: "Appliances", parent_id: null, parent_name: null }),
      category({ id: "c1" }),
      category({ id: "m1", name: "Miscellaneous", parent_id: null, parent_name: null }),
    ];
    expect(groupCategories(rows).map((item) => [item.row.id, item.kind])).toEqual([
      ["p1", "group"],
      ["c1", "row"],
      ["m1", "row"],
    ]);
  });
});

describe("a refused save", () => {
  const refusal = new ApiError(
    422,
    "bounds_pct must be more than 0 and at most 100",
    "PRICING_INVALID",
    undefined,
    { field: "bounds_pct" },
  );

  it("shows the backend's message, in the screen's words", () => {
    expect(pricingErrorMessage(refusal)).toBe("Bounds must be more than 0 and at most 100");
    expect(pricingErrorMessage(new ApiError(403, "Forbidden"))).toBe(
      "Your role can't change pricing.",
    );
    expect(pricingErrorMessage(new Error("offline"))).toBe("Couldn't save. Try again.");
  });

  it("names the column the 422 points at, and nothing for a body or value error", () => {
    expect(errorField(refusal)).toBe("bounds_pct");
    expect(
      errorField(new ApiError(422, "x", "PRICING_INVALID", undefined, { field: "body" })),
    ).toBeNull();
    expect(errorField(new ApiError(403, "x"))).toBeNull();
  });
});
