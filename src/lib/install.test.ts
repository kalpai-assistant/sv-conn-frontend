/**
 * Install-state detection (SVC-255 item 3).
 *
 * Every branch here decides what a stranded provider is told, and each one is
 * only reachable on hardware we mostly do not have. A wrong branch is not a
 * cosmetic bug: sending an iOS Safari user the Android one-tap button shows a
 * control that does nothing, and sending a Chrome-on-iOS user the Add to Home
 * Screen steps sends them somewhere that cannot work — Chrome on iOS has no
 * such menu item. Unit coverage is the only place these get exercised.
 *
 * The distinction that matters most is `ios-manual` vs `ios-wrong-browser`:
 * both are "iOS, not installed, no push", but one has a remedy the provider can
 * follow right now and the other needs them to switch browser first.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const isNativePlatform = vi.fn();
const detectPlatform = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));
vi.mock("./platform", () => ({ detectPlatform: () => detectPlatform() }));

/** `detectPlatform()` result with everything false unless overridden. */
function platform(over: Partial<ReturnType<typeof detectPlatform>> = {}) {
  return {
    platform: "desktop",
    isSafari: false,
    isChromeIOS: false,
    isIosStandalone: false,
    ...over,
  };
}

/** Stub `matchMedia`, which decides "already installed" off iOS. */
function setStandalone(standalone: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: standalone && q.includes("standalone"),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

/** Fire the Chrome event the module captures at import time. */
function fireBeforeInstallPrompt() {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(event, "userChoice", {
    value: Promise.resolve({ outcome: "accepted" }),
  });
  window.dispatchEvent(event);
  return event;
}

async function load() {
  return import("./install");
}

beforeEach(() => {
  vi.resetModules();
  isNativePlatform.mockReturnValue(false);
  detectPlatform.mockReturnValue(platform());
  setStandalone(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("iOS", () => {
  it("Safari not installed → the Add to Home Screen walkthrough", async () => {
    detectPlatform.mockReturnValue(platform({ platform: "ios", isSafari: true }));
    const { useInstallState } = await load();

    const { result } = renderHook(() => useInstallState());

    expect(result.current.state).toBe("ios-manual");
  });

  it("Chrome on iOS → sent to Safari, never the Home Screen steps", async () => {
    // Chrome on iOS has no Add to Home Screen item at all, so showing those
    // steps would send the provider hunting for a menu entry that isn't there.
    detectPlatform.mockReturnValue(platform({ platform: "ios", isChromeIOS: true }));
    const { useInstallState } = await load();

    const { result } = renderHook(() => useInstallState());

    expect(result.current.state).toBe("ios-wrong-browser");
  });

  it("a non-Safari, non-Chrome iOS browser is also wrong-browser", async () => {
    // Firefox and Edge on iOS are Safari WebViews that likewise cannot install.
    detectPlatform.mockReturnValue(platform({ platform: "ios" }));
    const { useInstallState } = await load();

    const { result } = renderHook(() => useInstallState());

    expect(result.current.state).toBe("ios-wrong-browser");
  });

  it("already installed → nothing to offer", async () => {
    detectPlatform.mockReturnValue(
      platform({ platform: "ios", isSafari: true, isIosStandalone: true }),
    );
    const { useInstallState } = await load();

    const { result } = renderHook(() => useInstallState());

    expect(result.current.state).toBe("installed");
  });

  it("installing costs the session on iOS, and only there", async () => {
    // The warning in the sheet is driven by this. If it ever returns false for
    // ios-manual, providers get signed out with no warning at the moment we
    // told them things would improve.
    const { installCostsSession } = await load();

    expect(installCostsSession("ios-manual")).toBe(true);
    expect(installCostsSession("can-prompt")).toBe(false);
    expect(installCostsSession("installed")).toBe(false);
  });
});

describe("Android / desktop", () => {
  it("offers a one-tap install once the browser hands us a prompt", async () => {
    detectPlatform.mockReturnValue(platform({ platform: "android" }));
    const { useInstallState } = await load();
    const { result, rerender } = renderHook(() => useInstallState());

    // Nothing captured yet — claiming installable here would render a dead button.
    expect(result.current.state).toBe("unavailable");

    fireBeforeInstallPrompt();
    rerender();

    expect(result.current.state).toBe("can-prompt");
  });

  it("stops offering once the install completes", async () => {
    detectPlatform.mockReturnValue(platform({ platform: "android" }));
    const { useInstallState } = await load();
    const { result, rerender } = renderHook(() => useInstallState());
    fireBeforeInstallPrompt();
    rerender();
    expect(result.current.state).toBe("can-prompt");

    // Chrome's own menu can install it too, bypassing our button entirely.
    window.dispatchEvent(new Event("appinstalled"));
    rerender();

    expect(result.current.state).toBe("unavailable");
  });

  it("promptInstall reports acceptance and consumes the prompt", async () => {
    detectPlatform.mockReturnValue(platform({ platform: "android" }));
    const { useInstallState } = await load();
    const { result, rerender } = renderHook(() => useInstallState());
    fireBeforeInstallPrompt();
    rerender();

    await expect(result.current.promptInstall()).resolves.toBe(true);

    // A second tap must not re-show it — Chrome throws on a reused prompt.
    await expect(result.current.promptInstall()).resolves.toBe(false);
  });

  it("running standalone counts as installed", async () => {
    detectPlatform.mockReturnValue(platform({ platform: "android" }));
    setStandalone(true);
    const { useInstallState } = await load();

    const { result } = renderHook(() => useInstallState());

    expect(result.current.state).toBe("installed");
  });
});

describe("native app", () => {
  it("never offers an install — the APK is already the app", async () => {
    isNativePlatform.mockReturnValue(true);
    detectPlatform.mockReturnValue(platform({ platform: "android" }));
    const { useInstallState } = await load();

    const { result } = renderHook(() => useInstallState());

    expect(result.current.state).toBe("installed");
  });
});
