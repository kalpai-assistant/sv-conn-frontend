/**
 * SVC-416: the pro-selection sheet's pure rules: where the list splits, the
 * unit labels, the name fallback, and what counts as a single-SP conflict.
 */
import { describe, expect, it } from "vitest";
import type { API_RankedProvider } from "@/hooks/useApi";
import type { CartLineItem } from "@/lib/cart-context";
import { hasSpConflict, priceUnitLabel, proDisplayName, splitProviders } from "./pro-selection";

const sp = (id: string, outside = false): API_RankedProvider => ({
  sp_id: id,
  name: `SP ${id}`,
  price_amount: 450,
  price_unit: "PER_VISIT",
  rating_avg: 4.5,
  rating_count: 10,
  distance_km: 2,
  reliability_score: 0.9,
  score: 0.8,
  why: [],
  is_boosted: false,
  outside_recommended_range: outside,
});

describe("splitProviders", () => {
  it("splits at the first out-of-range row, keeping the server's order", () => {
    const { inRange, outOfRange } = splitProviders([
      sp("a"),
      sp("b"),
      sp("c", true),
      sp("d", true),
    ]);
    expect(inRange.map((p) => p.sp_id)).toEqual(["a", "b"]);
    expect(outOfRange.map((p) => p.sp_id)).toEqual(["c", "d"]);
  });

  it("puts everything in the second list when no SP is in range", () => {
    const { inRange, outOfRange } = splitProviders([sp("a", true), sp("b", true)]);
    expect(inRange).toEqual([]);
    expect(outOfRange.map((p) => p.sp_id)).toEqual(["a", "b"]);
  });

  it("leaves the second list empty when every SP is in range", () => {
    const { inRange, outOfRange } = splitProviders([sp("a"), sp("b")]);
    expect(inRange.map((p) => p.sp_id)).toEqual(["a", "b"]);
    expect(outOfRange).toEqual([]);
  });

  it("handles an empty response", () => {
    expect(splitProviders([])).toEqual({ inRange: [], outOfRange: [] });
  });
});

describe("priceUnitLabel", () => {
  it.each([
    ["PER_VISIT", "/ visit"],
    ["PER_SQFT", "/ sq ft"],
    ["PER_HOUR", "/ hour"],
    ["PER_ITEM", "/ item"],
  ])("%s → %s", (unit, label) => {
    expect(priceUnitLabel(unit)).toBe(label);
  });

  it("gives no label for a unit it doesn't know, rather than guessing", () => {
    expect(priceUnitLabel("PER_TAP")).toBeNull();
  });
});

describe("proDisplayName", () => {
  it("uses the SP's name", () => {
    expect(proDisplayName("Rakesh Plumbing")).toBe("Rakesh Plumbing");
  });

  it.each([null, "", "   "])("falls back to 'Service pro' for %j", (name) => {
    expect(proDisplayName(name)).toBe("Service pro");
  });
});

describe("hasSpConflict", () => {
  const line = (serviceId: string, spId?: string): CartLineItem => ({
    serviceId,
    name: serviceId,
    unitPrice: 100,
    quantity: 1,
    spId,
  });

  it("conflicts when another service's line has a different SP", () => {
    expect(hasSpConflict([line("s1", "sp-a")], "s2", "sp-b")).toBe(true);
  });

  it("doesn't conflict with the same SP", () => {
    expect(hasSpConflict([line("s1", "sp-a")], "s2", "sp-a")).toBe(false);
  });

  it("doesn't count lines without an SP (SVC-417 clears those)", () => {
    expect(hasSpConflict([line("s1")], "s2", "sp-b")).toBe(false);
  });

  it("doesn't count the line being re-picked", () => {
    expect(hasSpConflict([line("s1", "sp-a")], "s1", "sp-b")).toBe(false);
  });

  it("doesn't conflict with an empty cart", () => {
    expect(hasSpConflict([], "s1", "sp-a")).toBe(false);
  });
});
