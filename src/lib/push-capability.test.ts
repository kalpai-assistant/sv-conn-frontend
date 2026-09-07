/**
 * Push-capability telemetry (SVC-255) — one report per registration attempt.
 *
 * The whole ticket rests on this number, and it is the kind of code that keeps
 * working while quietly reporting the wrong thing. Two failure modes matter and
 * neither is visible in the app:
 *
 * 1. Reporting only successes. Then the denominator is missing again and the
 *    measurement reproduces the blind spot it exists to close.
 * 2. Reporting native `granted` as a success. Native `register()` resolves
 *    *before* the token exists, so "granted" alone is not "push works" — and
 *    "granted but no token ever arrived" is precisely the silent failure that
 *    made providers miss jobs.
 *
 * Driven through `enablePushNotifications`, the public entry point, rather than
 * the internal helpers: what is asserted is the request that leaves the device.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const isNativePlatform = vi.fn();
const detectPlatform = vi.fn();

vi.mock("./api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("./platform", () => ({ detectPlatform: () => detectPlatform() }));
vi.mock("./sentry", () => ({ reportError: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

const notificationMock = {
  permission: "granted" as NotificationPermission,
  requestPermission: vi.fn(),
};

/** The body of the push-capability POST, or null if none was sent. */
function capabilityBody(): Record<string, unknown> | null {
  const call = apiFetch.mock.calls.find(([path]) => path === "/users/me/push-capability");
  return call ? JSON.parse((call[1] as { body: string }).body) : null;
}

function capabilityCallCount(): number {
  return apiFetch.mock.calls.filter(([path]) => path === "/users/me/push-capability").length;
}

/** A native plugin stub whose permission state the test picks. */
function mockNativePlugin(receive: string) {
  vi.doMock("@capacitor/push-notifications", () => ({
    PushNotifications: {
      checkPermissions: vi.fn().mockResolvedValue({ receive }),
      requestPermissions: vi.fn().mockResolvedValue({ receive }),
      register: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(undefined),
      // Registration creates the job-request channel on the way past
      // (SVC-278). Stubbed because the real plugin has it — omitting it would
      // exercise `ensureJobRequestChannel`'s error path on every test here.
      createChannel: vi.fn().mockResolvedValue(undefined),
      deleteChannel: vi.fn().mockResolvedValue(undefined),
    },
  }));
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  apiFetch.mockReset().mockResolvedValue(undefined);
  isNativePlatform.mockReturnValue(false);
  detectPlatform.mockReturnValue({
    platform: "desktop",
    isSafari: false,
    isChromeIOS: false,
    isIosStandalone: false,
  });
  notificationMock.permission = "granted";
  notificationMock.requestPermission = vi.fn().mockResolvedValue("granted");
  vi.stubGlobal("Notification", notificationMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("web", () => {
  it("reports a denied permission — the failure still needs counting", async () => {
    notificationMock.permission = "denied";
    const { enablePushNotifications } = await import("./fcm");

    await enablePushNotifications();

    expect(capabilityCallCount()).toBe(1);
    expect(capabilityBody()).toMatchObject({
      platform: "desktop",
      is_native: false,
      push_permission: "denied",
      token_obtained: false,
      interactive: true,
    });
  });

  it("carries the iOS fields that decide the ticket", async () => {
    detectPlatform.mockReturnValue({
      platform: "ios",
      isSafari: true,
      isChromeIOS: false,
      isIosStandalone: false,
    });
    notificationMock.permission = "denied";
    const { enablePushNotifications } = await import("./fcm");

    await enablePushNotifications();

    expect(capabilityBody()).toMatchObject({
      platform: "ios",
      ios_standalone: false,
      is_chrome_ios: false,
    });
  });

  it("reports Chrome-on-iOS separately — it cannot install to the Home Screen", async () => {
    detectPlatform.mockReturnValue({
      platform: "ios",
      isSafari: false,
      isChromeIOS: true,
      isIosStandalone: false,
    });
    notificationMock.permission = "denied";
    const { enablePushNotifications } = await import("./fcm");

    await enablePushNotifications();

    expect(capabilityBody()).toMatchObject({ platform: "ios", is_chrome_ios: true });
  });

  it("reports an installed iOS PWA as standalone", async () => {
    detectPlatform.mockReturnValue({
      platform: "ios",
      isSafari: true,
      isChromeIOS: false,
      isIosStandalone: true,
    });
    notificationMock.permission = "denied";
    const { enablePushNotifications } = await import("./fcm");

    await enablePushNotifications();

    expect(capabilityBody()).toMatchObject({ platform: "ios", ios_standalone: true });
  });

  it("reports unsupported when there is no Notification API at all", async () => {
    vi.stubGlobal("Notification", undefined);
    const { enablePushNotifications } = await import("./fcm");

    await enablePushNotifications();

    expect(capabilityBody()).toMatchObject({
      push_permission: "unsupported",
      token_obtained: false,
    });
  });

  it("does not let a failing report break registration", async () => {
    notificationMock.permission = "denied";
    apiFetch.mockRejectedValue(new Error("404 — backend predates this endpoint"));
    const { enablePushNotifications } = await import("./fcm");

    await expect(enablePushNotifications()).resolves.toMatchObject({ status: "denied" });
  });
});

describe("native", () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    detectPlatform.mockReturnValue({
      platform: "android",
      isSafari: false,
      isChromeIOS: false,
      isIosStandalone: false,
    });
  });

  /**
   * Granted-with-no-token is the exact shape of the silent failure SVC-254 had
   * to work around. It must count as a failure, not a success.
   */
  it("granted alone is not success — it waits, then reports no token", async () => {
    mockNativePlugin("granted");
    const { enablePushNotifications } = await import("./fcm");

    await enablePushNotifications();
    // Nothing yet: the token may still be on its way.
    expect(capabilityCallCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(capabilityCallCount()).toBe(1);
    expect(capabilityBody()).toMatchObject({
      platform: "android",
      is_native: true,
      push_permission: "granted",
      token_obtained: false,
    });
  });

  it("a token arriving closes the attempt as a success, once", async () => {
    mockNativePlugin("granted");
    const { enablePushNotifications, sendFcmToken } = await import("./fcm");

    await enablePushNotifications();
    await sendFcmToken("a-real-device-token");

    expect(capabilityBody()).toMatchObject({
      push_permission: "granted",
      token_obtained: true,
    });

    // The wait must not then fire a second, contradicting report.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(capabilityCallCount()).toBe(1);
  });

  it("a denied native permission reports immediately — no token is coming", async () => {
    mockNativePlugin("denied");
    const { enablePushNotifications } = await import("./fcm");

    await enablePushNotifications();

    expect(capabilityCallCount()).toBe(1);
    expect(capabilityBody()).toMatchObject({
      push_permission: "denied",
      token_obtained: false,
    });
  });

  it("logout drops the pending attempt rather than POSTing without a session", async () => {
    mockNativePlugin("granted");
    const { enablePushNotifications, clearFcmToken } = await import("./fcm");

    await enablePushNotifications();
    await clearFcmToken(null);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(capabilityCallCount()).toBe(0);
  });
});
