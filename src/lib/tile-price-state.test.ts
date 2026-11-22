/**
 * SVC-496: an option row's price state and the sheet's default option, from
 * the service's from-prices row (the one the header reads).
 */
import { describe, expect, it } from "vitest";
import type { API_ServiceFromPrice } from "@/hooks/useApi";
import { defaultVariantId, isVariantSelectable, variantPriceState } from "@/lib/tile-price-state";

type Entry = API_ServiceFromPrice["variants"][number];
const row = (variants: Entry[], from_price: number | null = 1200): API_ServiceFromPrice => ({
  service_id: "s",
  from_price,
  served: true,
  variants,
});
const entry = (variant_id: string, from_price: number | null, outside = false): Entry => ({
  variant_id,
  from_price,
  outside_recommended_range: outside,
});

describe("variantPriceState", () => {
  it("prices a variant from its entry, floored like the tile", () => {
    expect(variantPriceState(row([entry("v1", 1874.75)]), "v1", 2499)).toEqual({
      kind: "price",
      amount: 1874,
      outsideRange: false,
    });
  });

  it("flags an out-of-range fallback", () => {
    expect(variantPriceState(row([entry("v1", 1000, true)]), "v1", 999)).toEqual({
      kind: "price",
      amount: 1000,
      outsideRange: true,
    });
  });

  it("greys a variant nobody listable prices", () => {
    const s = variantPriceState(row([entry("v1", null)]), "v1", 999);
    expect(s).toEqual({ kind: "no-pros" });
    expect(isVariantSelectable(s)).toBe(false);
  });

  it("uses the catalogue price, unrounded as before, when there is no row", () => {
    const s = variantPriceState(undefined, "v1", 499.5);
    expect(s).toEqual({ kind: "catalogue", amount: 499.5 });
    expect(isVariantSelectable(s)).toBe(true);
  });

  it("uses the catalogue price, never greyed, when the row has no entry for the variant", () => {
    const s = variantPriceState(row([entry("other", null)]), "v1", 799);
    expect(s).toEqual({ kind: "catalogue", amount: 799 });
    expect(isVariantSelectable(s)).toBe(true);
  });
});

describe("defaultVariantId", () => {
  const variants = [
    { id: "v1", price: 499 },
    { id: "v2", price: 798 },
    { id: "v3", price: 999 },
  ];

  it("gives the first option with no row (catalogue prices, as before)", () => {
    expect(defaultVariantId(variants, undefined, undefined)).toBe("v1");
  });

  it("gives the first selectable option on first open, skipping a greyed one", () => {
    const r = row([entry("v1", null), entry("v2", 850), entry("v3", 1000)]);
    expect(defaultVariantId(variants, undefined, r)).toBe("v2");
  });

  it("keeps the customer's pick while it is selectable", () => {
    const r = row([entry("v1", 500), entry("v2", 850), entry("v3", 1000)]);
    expect(defaultVariantId(variants, "v3", r)).toBe("v3");
  });

  it("moves off a pick that became greyed", () => {
    const r = row([entry("v1", null), entry("v2", null), entry("v3", 1000)]);
    expect(defaultVariantId(variants, "v2", r)).toBe("v3");
  });

  it("falls back to the first option when every option is greyed", () => {
    const r = row([entry("v1", null), entry("v2", null), entry("v3", null)], null);
    expect(defaultVariantId(variants, undefined, r)).toBe("v1");
  });

  it("is undefined for a service with no variants", () => {
    expect(defaultVariantId([], undefined, undefined)).toBeUndefined();
  });
});
