/**
 * SVC-490 · onboarding-earnings.ts smoke test.
 *
 * Phase-1 step-0 hero shows this range; if the shape silently changes (low
 * > high, missing confidence) the hero's `formatRupees(earnings.low)` call
 * would render garbage. One case locks the invariant until SVC-495 wires
 * real data.
 */
import { describe, expect, it } from "vitest";

import {
  getOnboardingEarningsPlaceholder,
  useOnboardingEarnings,
} from "./onboarding-earnings";

describe("onboarding-earnings", () => {
  // Catches: "low becomes > high after a careless edit, hero renders
  // '₹25,000–₹8,000'." Low must stay strictly less than high.
  it("placeholder range has low < high", () => {
    const range = getOnboardingEarningsPlaceholder();
    expect(range.low).toBeGreaterThan(0);
    expect(range.high).toBeGreaterThan(range.low);
  });

  // Catches: "placeholder label drops, hero accidentally reads as a specific
  // service claim — a promise we cannot keep until SVC-495."
  it("placeholder range is tagged confidence=\"placeholder\"", () => {
    expect(getOnboardingEarningsPlaceholder().confidence).toBe("placeholder");
  });

  // Catches: "hook starts returning something non-shape-matching once wired
  // to a backend — e.g. paise instead of rupees, or nested under { data }."
  it("hook returns the same shape as the sync helper today", () => {
    // Note: this test is not inside renderHook because the current impl is
    // a pure function. When SVC-495 lands and the hook starts calling React
    // Query, this test moves to renderHook.
    const direct = getOnboardingEarningsPlaceholder();
    const hooked = useOnboardingEarnings();
    expect(hooked).toEqual(direct);
  });
});
