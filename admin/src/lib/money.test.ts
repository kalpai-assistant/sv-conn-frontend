import { describe, expect, it } from "vitest";
import { formatRupees } from "@/lib/bookings";
import { formatPaise, formatRupees as moneyFormatRupees, formatRupeesCompact } from "@/lib/money";

describe("formatPaise", () => {
  it.each([
    [0, "₹0"],
    [100, "₹1"],
    [149_900, "₹1,499"],
    [149_950, "₹1,499.50"],
    [149_901, "₹1,499.01"],
    [10_000_000, "₹1,00,000"],
    [1_234_567_800, "₹1,23,45,678"],
  ])("%i paise reads %s", (paise, expected) => {
    expect(formatPaise(paise)).toBe(expected);
  });

  it("shows a negative wallet balance as negative", () => {
    expect(formatPaise(-25_000)).toBe("-₹250");
  });

  it("shows paise only when there are some", () => {
    expect(formatPaise(50)).toBe("₹0.50");
    expect(formatPaise(5_000)).toBe("₹50");
  });
});

describe("formatRupees", () => {
  it("is the one formatter: bookings re-exports money's", () => {
    expect(formatRupees).toBe(moneyFormatRupees);
    expect(formatRupees(1499.5)).toBe("₹1,499.50");
    expect(formatRupees(100000)).toBe("₹1,00,000");
  });
});

describe("formatRupeesCompact", () => {
  it.each([
    [0, "₹0"],
    [500, "₹500"],
    [12_000, "₹12K"],
    [120_000, "₹1.2L"],
    [25_000_000, "₹2.5Cr"],
  ])("%i reads %s", (amount, expected) => {
    expect(formatRupeesCompact(amount)).toBe(expected);
  });
});
