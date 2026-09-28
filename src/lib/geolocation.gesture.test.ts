/**
 * Who is allowed to ask without being asked (SVC-319).
 *
 * The launch probe requests a position before the user has touched anything.
 * That is only safe where an ungestured request is allowed to prompt — and on
 * iOS Safari it is not: the request is refused outright, as PERMISSION_DENIED,
 * which the gate then reads as the user having said no.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const isNativePlatform = vi.fn();
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

const detectPlatform = vi.fn();
vi.mock("@/lib/platform", () => ({ detectPlatform: () => detectPlatform() }));

import { canProbeWithoutGesture } from "@/lib/geolocation";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("probing without a user gesture", () => {
  it("is refused on iOS, where Safari will not prompt for one", () => {
    isNativePlatform.mockReturnValue(false);
    detectPlatform.mockReturnValue({ platform: "ios" });

    expect(canProbeWithoutGesture()).toBe(false);
  });

  it("is allowed on Android web, which answers the ungestured call", () => {
    isNativePlatform.mockReturnValue(false);
    detectPlatform.mockReturnValue({ platform: "android" });

    expect(canProbeWithoutGesture()).toBe(true);
  });

  it("is allowed on desktop", () => {
    isNativePlatform.mockReturnValue(false);
    detectPlatform.mockReturnValue({ platform: "desktop" });

    expect(canProbeWithoutGesture()).toBe(true);
  });

  it("is allowed in the native app, even on iOS", () => {
    // The plugin talks to the OS, not to a browser's gesture model, so the
    // iOS *app* is unaffected by Safari's rule.
    isNativePlatform.mockReturnValue(true);
    detectPlatform.mockReturnValue({ platform: "ios" });

    expect(canProbeWithoutGesture()).toBe(true);
  });
});
