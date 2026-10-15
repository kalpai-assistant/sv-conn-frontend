/**
 * The version gate on the native iOS app (SVC-366).
 *
 * An iPhone can't install an APK, and iOS has no release pipeline yet, so the
 * `ios` row's url is null. The gate must never reach the APK updater there,
 * never default the url to "/download", and never show a button that leads
 * nowhere.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VersionInfo } from "@/lib/useAppVersionCheck";

const useAppVersionCheck = vi.fn<() => VersionInfo>();
const apkDownload = vi.fn();
const apkIsSupported = vi.fn();

vi.mock("@/lib/useAppVersionCheck", () => ({ useAppVersionCheck: () => useAppVersionCheck() }));
vi.mock("@/lib/sentry", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/apkUpdater", () => ({
  canInstall: vi.fn().mockResolvedValue({ canInstall: true }),
  download: (...args: unknown[]) => apkDownload(...args),
  install: vi.fn(),
  isSupported: () => apkIsSupported(),
  onComplete: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  onFailed: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  onProgress: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  openInstallSettings: vi.fn(),
}));

import { AppVersionGate } from "./AppVersionGate";

function renderGate(info: VersionInfo) {
  useAppVersionCheck.mockReturnValue(info);
  return render(
    <AppVersionGate>
      <p>app</p>
    </AppVersionGate>,
  );
}

const IOS = { latest: "1.0.12", minSupported: "1.0.12", platform: "ios-native" } as const;

describe("AppVersionGate on native iOS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    // Even if the Android check misfired, iOS must not reach the updater.
    apkIsSupported.mockReturnValue(true);
  });

  it("nudge with no url: text and Later only, no update button", () => {
    renderGate({ state: "nudge", releaseNotes: "Fixes", ...IOS });

    expect(screen.getByText("Update available (v1.0.12)")).toBeInTheDocument();
    expect(screen.getByText("Fixes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Later" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /update/i })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(apkDownload).not.toHaveBeenCalled();
  });

  it("block with no url: the message and no action at all", () => {
    renderGate({ state: "block", ...IOS });

    expect(screen.getByText("Update required")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(apkDownload).not.toHaveBeenCalled();
  });

  it("with an App Store url: an external link, not the APK flow", () => {
    const url = "https://apps.apple.com/app/id000000000";
    renderGate({ state: "block", url, ...IOS });

    const link = screen.getByRole("link", { name: "Update now" });
    expect(link).toHaveAttribute("href", url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("button")).toBeNull();
    expect(apkDownload).not.toHaveBeenCalled();
  });
});

describe("AppVersionGate off iOS (unchanged)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("PWA with no url still falls back to /download", () => {
    apkIsSupported.mockReturnValue(false);
    renderGate({ state: "block", latest: "2.0.0", minSupported: "2.0.0" });

    expect(screen.getByRole("link", { name: "Update now" })).toHaveAttribute("href", "/download");
  });

  it("native Android still gets the in-app updater button", () => {
    apkIsSupported.mockReturnValue(true);
    renderGate({ state: "block", latest: "2.0.0", minSupported: "2.0.0" });

    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });
});
