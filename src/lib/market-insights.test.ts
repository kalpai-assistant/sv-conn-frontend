import { describe, expect, it } from "vitest";
import { barPosition, missingStanding } from "./market-insights";

describe("barPosition", () => {
  it("puts the lowest price at 0 and the highest at 100", () => {
    expect(barPosition(400, 400, 800)).toBe(0);
    expect(barPosition(800, 400, 800)).toBe(100);
  });

  it("places a price in between proportionally", () => {
    expect(barPosition(500, 400, 800)).toBe(25);
    expect(barPosition(600, 400, 800)).toBe(50);
  });

  it("puts everything in the middle when all prices are equal", () => {
    expect(barPosition(499, 499, 499)).toBe(50);
  });

  it("never draws off the bar", () => {
    expect(barPosition(300, 400, 800)).toBe(0);
    expect(barPosition(900, 400, 800)).toBe(100);
  });
});

describe("missingStanding", () => {
  it("is unset with no price, off with a price switched off, null when on", () => {
    expect(missingStanding({ price_amount: null, is_active: null })).toBe("unset");
    expect(missingStanding({ price_amount: 499, is_active: false })).toBe("off");
    expect(missingStanding({ price_amount: 499, is_active: true })).toBeNull();
  });
});
