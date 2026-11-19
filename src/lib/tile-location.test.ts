import { beforeEach, describe, expect, it } from "vitest";
import {
  FIX_MAX_AGE_MS,
  REFRESH_AFTER_MS,
  markRefreshAttempt,
  resetLaunchFix,
  setLaunchFix,
  shouldRefresh,
  usableFix,
} from "@/lib/tile-location";

const T0 = 1_000_000_000;

beforeEach(() => resetLaunchFix());

describe("usableFix", () => {
  it("is null with no fix", () => {
    expect(usableFix(T0)).toBeNull();
  });

  it("returns a fix up to 2 h old, and null after", () => {
    setLaunchFix({ lat: 1, lng: 2 }, T0);
    expect(usableFix(T0 + FIX_MAX_AGE_MS)).toEqual({ lat: 1, lng: 2, at: T0 });
    expect(usableFix(T0 + FIX_MAX_AGE_MS + 1)).toBeNull();
  });
});

describe("shouldRefresh", () => {
  it("is true with no fix and no attempt", () => {
    expect(shouldRefresh(T0)).toBe(true);
  });

  it("waits until the fix is 30 min old", () => {
    setLaunchFix({ lat: 1, lng: 2 }, T0);
    expect(shouldRefresh(T0 + REFRESH_AFTER_MS - 1)).toBe(false);
    expect(shouldRefresh(T0 + REFRESH_AFTER_MS)).toBe(true);
  });

  it("throttles attempts to one per 30 min, success or not", () => {
    markRefreshAttempt(T0);
    expect(shouldRefresh(T0 + 5 * 60 * 1000)).toBe(false);
    expect(shouldRefresh(T0 + REFRESH_AFTER_MS)).toBe(true);
  });
});
