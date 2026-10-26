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
import { FixedLanguage } from "@/i18n/LanguageProvider";
import type { AppLanguage } from "@/i18n/languages";

function renderGate(info: VersionInfo, lang: AppLanguage = "en") {
  useAppVersionCheck.mockReturnValue(info);
  return render(
    <FixedLanguage lang={lang}>
      <AppVersionGate>
        <p>app</p>
      </AppVersionGate>
    </FixedLanguage>,
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

describe("AppVersionGate in Hindi/Marathi (SVC-395)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    apkIsSupported.mockReturnValue(true);
  });

  it("English is unchanged, word for word", () => {
    renderGate({ state: "nudge", latest: "1.0.13-beta", releaseNotes: "Fixes" });
    expect(screen.getByText("Update available (v1.0.13-beta)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Later" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("nudge in Hindi, with the release notes as typed", () => {
    renderGate({ state: "nudge", latest: "1.0.13-beta", releaseNotes: "Fixes" }, "hi");
    expect(screen.getByText("अपडेट उपलब्ध है (v1.0.13-beta)")).toBeInTheDocument();
    expect(screen.getByText("Fixes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "अपडेट करें" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "बाद में" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "बंद करें" })).toBeInTheDocument();
  });

  it("block in Marathi, versions with Latin digits", () => {
    renderGate({ state: "block", latest: "2.0.0", minSupported: "1.9.0" }, "mr");
    expect(screen.getByText("अपडेट आवश्यक आहे")).toBeInTheDocument();
    expect(
      screen.getByText("EazyServ ची ही आवृत्ती आता चालणार नाही. पुढे जाण्यासाठी कृपया अपडेट करा."),
    ).toBeInTheDocument();
    expect(screen.getByText("किमान आवश्यक: v1.9.0 · नवीन: v2.0.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "अपडेट करा" })).toBeInTheDocument();
  });

  it("the off-Android link in Hindi", () => {
    apkIsSupported.mockReturnValue(false);
    renderGate({ state: "block", latest: "2.0.0", minSupported: "2.0.0" }, "hi");
    expect(screen.getByRole("link", { name: "अभी अपडेट करें" })).toHaveAttribute(
      "href",
      "/download",
    );
  });
});
