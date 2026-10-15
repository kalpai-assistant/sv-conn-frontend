/**
 * Which `latest.json` row each runtime compares against (SVC-366).
 *
 * The native iOS app and iOS Safari share a user agent ("iPhone"), so the UA
 * sniff alone routed the iOS app to the pwa row — a pwa bump would then nudge
 * or block iPhones that have no way to update. Native iOS is told apart by
 * Capacitor, mocked here per test.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const detectPlatform = vi.fn();
const isNativePlatform = vi.fn();
const getPlatform = vi.fn();
const getInfo = vi.fn();

vi.mock("./api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("./platform", () => ({ detectPlatform: () => detectPlatform() }));
vi.mock("./sentry", () => ({ reportError: vi.fn() }));
vi.mock("./version", () => ({ APP_VERSION: "1.0.11-beta" }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform(), getPlatform: () => getPlatform() },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    getInfo: () => getInfo(),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

import { useAppVersionCheck } from "./useAppVersionCheck";

function row(version: string, url: string | null = null) {
  return {
    version,
    min_supported_version: "1.0.0",
    url,
    release_notes: null,
    released_at: "2026-10-15T00:00:00Z",
  };
}

/** Each row a distinct version, so `latest` names which one was read. */
const ROWS = {
  android: row("2.0.0", "https://downloads.example/latest.apk"),
  pwa: row("3.0.0"),
  ios: row("4.0.0"),
};

function runtime(kind: "ios-native" | "android-native" | "ios-safari") {
  isNativePlatform.mockReturnValue(kind !== "ios-safari");
  getPlatform.mockReturnValue(
    kind === "android-native" ? "android" : kind === "ios-native" ? "ios" : "web",
  );
  detectPlatform.mockReturnValue({ platform: kind === "android-native" ? "android" : "ios" });
  getInfo.mockResolvedValue({ version: "1.0" });
}

async function settle() {
  const { result } = renderHook(() => useAppVersionCheck());
  await waitFor(() => expect(result.current.state).not.toBe("unknown"));
  return result.current;
}

describe("useAppVersionCheck row selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("native iOS compares against latest.ios", async () => {
    runtime("ios-native");
    apiFetch.mockResolvedValue(ROWS);

    const info = await settle();

    expect(info).toMatchObject({ state: "nudge", latest: "4.0.0", platform: "ios-native" });
    expect(info.url).toBeUndefined();
  });

  it("native iOS skips the check when the backend has no ios row — never the pwa row", async () => {
    runtime("ios-native");
    apiFetch.mockResolvedValue({ android: ROWS.android, pwa: ROWS.pwa });

    const info = await settle();

    expect(info).toEqual({ state: "ok" });
  });

  it("native Android still reads latest.android", async () => {
    runtime("android-native");
    apiFetch.mockResolvedValue(ROWS);

    const info = await settle();

    expect(info).toMatchObject({ state: "nudge", latest: "2.0.0", url: ROWS.android.url });
    expect(info.platform).toBeUndefined();
  });

  it("iOS Safari / the PWA still reads latest.pwa", async () => {
    runtime("ios-safari");
    apiFetch.mockResolvedValue(ROWS);

    const info = await settle();

    expect(info).toMatchObject({ state: "nudge", latest: "3.0.0" });
    expect(info.platform).toBeUndefined();
  });
});
