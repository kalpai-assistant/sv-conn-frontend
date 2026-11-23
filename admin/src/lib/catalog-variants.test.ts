import { describe, expect, it } from "vitest";
import type { ServiceVariantRow } from "./catalog";
import {
  changedVariantFields,
  checkEffectiveFrom,
  effectiveFromMin,
  emptyVariantForm,
  impactLines,
  parsePct,
  pctChange,
  pendingLabel,
  withoutPct,
  pctLabel,
  previewSplit,
  repricedSplit,
  splitAtPct,
  validateVariantForm,
  variantCreateBody,
  variantFormFrom,
} from "./catalog-variants";

/** ₹240 on ₹799: an exact ratio of 30.0375%, shown as 30.04. */
function row(extra: Partial<ServiceVariantRow> = {}): ServiceVariantRow {
  return {
    id: "v1",
    label: "1 BHK",
    subcategory: null,
    base_price: 799,
    duration_minutes: null,
    sort_order: 0,
    is_active: true,
    platform_commission: 240,
    provider_payout: 559,
    commission_pct: 30.04,
    gst_percent: 18,
    pending_commission_change: null,
    ...extra,
  };
}

const check = (form: ReturnType<typeof emptyVariantForm>, baseline?: ServiceVariantRow) => {
  const result = validateVariantForm(form, baseline);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.values;
};

describe("the variant form", () => {
  it("prefills from the row, the duration blank when the service's applies", () => {
    expect(variantFormFrom(row())).toEqual({
      label: "1 BHK",
      base_price: "799",
      commission_pct: "30.04",
      duration_minutes: "",
      sort_order: "0",
    });
    expect(variantFormFrom(row({ duration_minutes: 90, base_price: 849.5 })).duration_minutes).toBe(
      "90",
    );
  });

  it("sends nothing when nothing changed", () => {
    const base = row();
    expect(changedVariantFields(base, check(variantFormFrom(base), base))).toEqual({});
  });

  it("leaves commission_pct out when only the price changed", () => {
    const base = row();
    const form = { ...variantFormFrom(base), base_price: "849" };
    expect(changedVariantFields(base, check(form, base))).toEqual({ base_price: 849 });
  });

  it("sends commission_pct only when the admin changed it", () => {
    const base = row();
    const form = { ...variantFormFrom(base), commission_pct: "35" };
    expect(changedVariantFields(base, check(form, base))).toEqual({ commission_pct: 35 });
    // Retyping the same value as "30.040" is no change.
    const same = { ...variantFormFrom(base), commission_pct: "30.04" };
    expect(changedVariantFields(base, check(same, base))).toEqual({});
  });

  it("sends label, duration and sort order changes", () => {
    const base = row();
    const form = {
      ...variantFormFrom(base),
      label: "  Studio ",
      duration_minutes: "120",
      sort_order: "3",
    };
    expect(changedVariantFields(base, check(form, base))).toEqual({
      label: "Studio",
      duration_minutes: 120,
      sort_order: 3,
    });
  });

  it("checks values like the backend", () => {
    const errors = (
      form: Partial<ReturnType<typeof emptyVariantForm>>,
      base?: ServiceVariantRow,
    ) => {
      const result = validateVariantForm({ ...emptyVariantForm(), ...form }, base);
      return result.ok ? {} : result.errors;
    };
    expect(errors({})).toEqual({
      label: "Enter a label.",
      base_price: "Enter the price.",
      commission_pct: "Enter the commission %.",
    });
    expect(errors({ label: "x", base_price: "0", commission_pct: "100" })).toEqual({
      base_price: "More than ₹0.",
      commission_pct: "At least 0 and below 100.",
    });
    expect(
      errors({
        label: "x",
        base_price: "1000001",
        commission_pct: "1.234",
        duration_minutes: "10",
      }),
    ).toEqual({
      base_price: "At most ₹10,00,000.",
      commission_pct: "At most 2 decimal places.",
      duration_minutes: "15 to 480 minutes.",
    });
    expect(errors({ label: "x".repeat(201), base_price: "1", commission_pct: "0" })).toEqual({
      label: "At most 200 characters.",
    });
  });

  it("refuses clearing a set duration on edit (the backend refuses null)", () => {
    const base = row({ duration_minutes: 90 });
    const result = validateVariantForm({ ...variantFormFrom(base), duration_minutes: "" }, base);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.duration_minutes).toMatch(/can't be cleared/);
  });

  it("leaves blank duration and sort order out of a create", () => {
    const values = check({
      ...emptyVariantForm(),
      label: "4 BHK",
      base_price: "3999",
      commission_pct: "30",
    });
    expect(variantCreateBody(values)).toEqual({
      label: "4 BHK",
      base_price: 3999,
      commission_pct: 30,
    });
    const full = check({
      label: "4 BHK",
      base_price: "3999",
      commission_pct: "30",
      duration_minutes: "240",
      sort_order: "4",
    });
    expect(variantCreateBody(full)).toEqual({
      label: "4 BHK",
      base_price: 3999,
      commission_pct: 30,
      duration_minutes: 240,
      sort_order: 4,
    });
  });

  it("parses a percent with a stray % sign", () => {
    expect(parsePct("30 %")).toEqual({ ok: true, value: 30 });
    expect(parsePct("abc").ok).toBe(false);
  });
});

describe("the split preview", () => {
  it("keeps the row's exact ratio on a price-only edit: repriced_split, not 30.04%", () => {
    // 849 × 240 / 799 = 255.0187… → 255.02. 30.04% of 849 would be 255.04.
    expect(repricedSplit(row(), 849)).toEqual({ commission: 255.02, payout: 593.98 });
    expect(previewSplit({ ...variantFormFrom(row()), base_price: "849" }, row())).toEqual({
      commission: 255.02,
      payout: 593.98,
    });
  });

  it("gives back the stored amounts at the stored price", () => {
    expect(previewSplit(variantFormFrom(row()), row())).toEqual({ commission: 240, payout: 559 });
  });

  it("uses the typed percent once it's changed: split_at_pct", () => {
    expect(splitAtPct(849, 35)).toEqual({ commission: 297.15, payout: 551.85 });
    expect(
      previewSplit({ ...variantFormFrom(row()), base_price: "849", commission_pct: "35" }, row()),
    ).toEqual({ commission: 297.15, payout: 551.85 });
  });

  it("rounds half up to paise", () => {
    // 0.5 paise: 1.01 × 50% = 0.505 → 0.51.
    expect(splitAtPct(1.01, 50)).toEqual({ commission: 0.51, payout: 0.5 });
    // 999.99 × 12.5% = 124.99875 → 125.00.
    expect(splitAtPct(999.99, 12.5)).toEqual({ commission: 125, payout: 874.99 });
  });

  it("uses the typed percent on a create", () => {
    expect(
      previewSplit({ ...emptyVariantForm(), base_price: "2499", commission_pct: "30" }),
    ).toEqual({ commission: 749.7, payout: 1749.3 });
  });

  it("shows nothing while the price or percent doesn't parse, or for a row priced 0", () => {
    expect(previewSplit({ ...emptyVariantForm(), base_price: "abc", commission_pct: "30" })).toBe(
      null,
    );
    expect(previewSplit({ ...emptyVariantForm(), base_price: "100", commission_pct: "" })).toBe(
      null,
    );
    expect(repricedSplit(row({ base_price: 0, platform_commission: 0 }), 100)).toBe(null);
  });
});

describe("the confirm steps", () => {
  it("counts pros moving out and back in", () => {
    expect(
      impactLines({ sp_prices: 5, outside_now: 1, outside_after: 3, moving_out: 3, moving_in: 1 }),
    ).toEqual([
      "3 pros move outside the recommended range, 1 moves back in.",
      "5 pros have a price on this variant. Their prices and existing bookings don't change.",
    ]);
  });

  it("says no pros are affected when nobody moves (incl. a category with no range)", () => {
    expect(
      impactLines({ sp_prices: 2, outside_now: 0, outside_after: 0, moving_out: 0, moving_in: 0 }),
    ).toEqual([
      "No pros move in or out of the recommended range.",
      "2 pros have a price on this variant. Their prices and existing bookings don't change.",
    ]);
    expect(
      impactLines({
        sp_prices: 0,
        outside_now: 0,
        outside_after: 0,
        moving_out: 0,
        moving_in: 0,
      })[1],
    ).toBe("No pros have a price on this variant yet.");
  });

  it("labels percents without trailing zeros", () => {
    expect(pctLabel(30.04)).toBe("30.04%");
    expect(pctLabel(35)).toBe("35%");
    expect(pctLabel(18.5)).toBe("18.5%");
  });
});

describe("scheduling a commission change (SVC-486)", () => {
  const today = "2026-11-23";

  it("reads the direction at 2 dp against the row's percent", () => {
    expect(pctChange(row(), 30.04)).toBe(null);
    expect(pctChange(row(), 30.05)).toBe("increase");
    expect(pctChange(row(), 25)).toBe("decrease");
  });

  it("an increase starts 14 days out; a decrease today", () => {
    expect(effectiveFromMin("increase", today)).toBe("2026-12-07");
    expect(effectiveFromMin("decrease", today)).toBe(today);
  });

  it("allows today+14 for an increase, not the day before", () => {
    expect(checkEffectiveFrom("2026-12-07", "increase", today)).toBe(null);
    expect(checkEffectiveFrom("2026-12-06", "increase", today)).toBe(
      "An increase needs 14 days' notice: 7 Dec 2026 or later.",
    );
  });

  it("allows a decrease today, not yesterday", () => {
    expect(checkEffectiveFrom(today, "decrease", today)).toBe(null);
    expect(checkEffectiveFrom("2026-11-22", "decrease", today)).toBe(
      "Today (23 Nov 2026) or later.",
    );
  });

  it("needs a date", () => {
    expect(checkEffectiveFrom("", "decrease", today)).toBe("Pick the date it takes effect.");
  });

  it("never PATCHes the percent", () => {
    expect(withoutPct({ base_price: 849, commission_pct: 35, label: "x" })).toEqual({
      base_price: 849,
      label: "x",
    });
  });

  it("labels the pending change, the date as sent", () => {
    expect(
      pendingLabel({
        id: "c1",
        new_pct: 25,
        effective_from: "2026-12-06",
        created_at: "2026-11-22T10:00:00Z",
      }),
    ).toBe("→ 25% from 6 Dec 2026");
  });
});
