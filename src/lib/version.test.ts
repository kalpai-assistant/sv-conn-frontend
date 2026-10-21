/**
 * displayVersion() — which label the UI shows per runtime (SVC-372).
 *
 * The native iOS app and iOS Safari share a user agent, so the UA sniff
 * alone showed both the Android label on iOS. Native iOS is told apart by
 * Capacitor's `isNativePlatform() + getPlatform()`, mocked here per test,
 * mirroring the pattern in `useAppVersionCheck.test.tsx`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const isNativePlatform = vi.fn();
const getPlatform = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform(), getPlatform: () => getPlatform() },
}));

import { APP_VERSION, IOS_APP_VERSION, displayVersion } from "./version";

function runtime(kind: "ios-native" | "android-native" | "ios-safari" | "pwa") {
  isNativePlatform.mockReturnValue(kind === "ios-native" || kind === "android-native");
  getPlatform.mockReturnValue(
    kind === "android-native"
      ? "android"
      : kind === "ios-native"
        ? "ios"
        : // iOS Safari + the PWA both report "web"
          "web",
  );
}

describe("displayVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("native iOS shows IOS_APP_VERSION (the suffix lives on the JS side)", () => {
    runtime("ios-native");
    expect(displayVersion()).toBe(IOS_APP_VERSION);
  });

  it("native Android shows APP_VERSION — its own version-check row, its own label", () => {
    runtime("android-native");
    expect(displayVersion()).toBe(APP_VERSION);
  });

  it("iOS Safari shows APP_VERSION — it's the PWA, not the native shell", () => {
    runtime("ios-safari");
    expect(displayVersion()).toBe(APP_VERSION);
  });

  it("desktop / Android PWA shows APP_VERSION", () => {
    runtime("pwa");
    expect(displayVersion()).toBe(APP_VERSION);
  });

  it("IOS_APP_VERSION is distinct from APP_VERSION — they drift on purpose", () => {
    // The two drift because Android/PWA ship on their own cadence and iOS
    // starts behind. If someone collapses them back into a single constant,
    // this test is the alarm.
    expect(IOS_APP_VERSION).not.toBe(APP_VERSION);
  });
});
