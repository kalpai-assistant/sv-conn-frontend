/**
 * SVC-398: the thin haptics wrapper.
 *
 * Two guards matter: `Capacitor.isNativePlatform()` so the web PWA stays a
 * no-op even if the plugin ever changes behaviour, and the fire-and-forget
 * catch so a rejected impact/notification (device-settings-disabled, bridge
 * not ready) never surfaces as an uncaught rejection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nativeMock = vi.hoisted(() => ({ native: true }));
const impactSpy = vi.hoisted(() => vi.fn((_opts: unknown) => Promise.resolve()));
const notificationSpy = vi.hoisted(() => vi.fn((_opts: unknown) => Promise.resolve()));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => nativeMock.native },
}));

vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: (opts: unknown) => impactSpy(opts),
    notification: (opts: unknown) => notificationSpy(opts),
  },
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM", Heavy: "HEAVY" },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
}));

import { hapticImpactLight, hapticSuccess } from "@/lib/haptics";

beforeEach(() => {
  nativeMock.native = true;
  impactSpy.mockClear();
  notificationSpy.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("hapticImpactLight", () => {
  it("fires an ImpactStyle.Light on native platforms", () => {
    hapticImpactLight();
    expect(impactSpy).toHaveBeenCalledWith({ style: "LIGHT" });
  });

  it("is a no-op on the web PWA", () => {
    // Belt-and-braces: the plugin itself no-ops on web, but the guard means a
    // rejected import or missing bridge never reaches the plugin either.
    nativeMock.native = false;
    hapticImpactLight();
    expect(impactSpy).not.toHaveBeenCalled();
  });

  it("swallows a rejected impact so the CTA path stays clean", async () => {
    impactSpy.mockImplementationOnce(() => Promise.reject(new Error("vibration disabled")));
    expect(() => hapticImpactLight()).not.toThrow();
    // Flush microtasks so the swallowed rejection has a chance to surface.
    await Promise.resolve();
    await Promise.resolve();
  });
});

describe("hapticSuccess", () => {
  it("fires a NotificationType.Success on native platforms", () => {
    hapticSuccess();
    expect(notificationSpy).toHaveBeenCalledWith({ type: "SUCCESS" });
  });

  it("is a no-op on the web PWA", () => {
    nativeMock.native = false;
    hapticSuccess();
    expect(notificationSpy).not.toHaveBeenCalled();
  });

  it("swallows a rejected notification", async () => {
    notificationSpy.mockImplementationOnce(() => Promise.reject(new Error("disabled")));
    expect(() => hapticSuccess()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
