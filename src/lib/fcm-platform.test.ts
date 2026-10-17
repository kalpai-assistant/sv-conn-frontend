/**
 * The push token's platform (SVC-371).
 *
 * The release push is filtered on the platform stored with the token, so a
 * wrong value here either pings an app that has nothing to update or — worse —
 * skips the one that does. Driven through the real registration paths (the
 * native `registration` listener, the web enable button) rather than calling
 * `sendFcmToken` directly, so a caller that bypassed it would fail here too.
 *
 * iOS is only checkable here: there is no iOS build yet (Jira comment 14769).
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const isNativePlatform = vi.fn();
const getPlatform = vi.fn();

vi.mock("./api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("./sentry", () => ({ reportError: vi.fn() }));
vi.mock("./notification-channels", () => ({ ensureJobRequestChannel: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform(), getPlatform: () => getPlatform() },
}));

/** Bodies of every PATCH to the token endpoint, in order. */
function tokenBodies(): Record<string, unknown>[] {
  return apiFetch.mock.calls
    .filter(([path]) => path === "/users/me/fcm-token")
    .map(([, init]) => JSON.parse((init as { body: string }).body));
}

/**
 * A native plugin stub that hands back the `registration` listener, so the
 * test can deliver a token the way the OS does.
 */
function mockNativePlugin() {
  const listeners: Record<string, (event: { value: string }) => void> = {};
  vi.doMock("@capacitor/push-notifications", () => ({
    PushNotifications: {
      addListener: vi.fn(async (event: string, cb: (e: { value: string }) => void) => {
        listeners[event] = cb;
        return { remove: vi.fn() };
      }),
      checkPermissions: vi.fn().mockResolvedValue({ receive: "granted" }),
      requestPermissions: vi.fn().mockResolvedValue({ receive: "granted" }),
      register: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(undefined),
    },
  }));
  return listeners;
}

/** Mount the hook on native and deliver one token through the listener. */
async function registerNativeToken(token: string) {
  const listeners = mockNativePlugin();
  const { useFcmRegistration } = await import("./fcm");
  renderHook(() => useFcmRegistration(true));
  await vi.waitFor(() => expect(listeners.registration).toBeDefined());
  listeners.registration({ value: token });
  await vi.waitFor(() => expect(tokenBodies()).toHaveLength(1));
}

beforeEach(() => {
  vi.resetModules();
  apiFetch.mockReset().mockResolvedValue(undefined);
  isNativePlatform.mockReturnValue(false);
  getPlatform.mockReturnValue("web");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("@capacitor/push-notifications");
  vi.doUnmock("./firebase");
  vi.doUnmock("firebase/messaging");
});

describe("native", () => {
  beforeEach(() => isNativePlatform.mockReturnValue(true));

  it("android sends platform android", async () => {
    getPlatform.mockReturnValue("android");
    await registerNativeToken("android-token");
    expect(tokenBodies()[0]).toEqual({ fcm_token: "android-token", platform: "android" });
  });

  it("ios sends platform ios", async () => {
    getPlatform.mockReturnValue("ios");
    await registerNativeToken("ios-token");
    expect(tokenBodies()[0]).toEqual({ fcm_token: "ios-token", platform: "ios" });
  });

  it("an unknown native platform omits the field rather than risk a 422", async () => {
    getPlatform.mockReturnValue("electron");
    await registerNativeToken("odd-token");
    expect(tokenBodies()[0]).toEqual({ fcm_token: "odd-token" });
  });
});

describe("web", () => {
  it("the web SDK sends platform web", async () => {
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
    vi.doMock("./firebase", () => ({
      getFirebaseMessaging: vi.fn().mockResolvedValue({}),
      VAPID_PUBLIC_KEY: "test-vapid",
    }));
    vi.doMock("firebase/messaging", () => ({
      getToken: vi.fn().mockResolvedValue("web-token"),
    }));
    const { enablePushNotifications } = await import("./fcm");

    await enablePushNotifications();

    expect(tokenBodies()).toEqual([{ fcm_token: "web-token", platform: "web" }]);
  });
});

describe("clears", () => {
  // The backend nulls the platform along with the token; a clear never names one.
  it("disabling sends only a null token", async () => {
    const { disablePushNotifications } = await import("./fcm");
    await disablePushNotifications();
    expect(tokenBodies()).toEqual([{ fcm_token: null }]);
  });

  it("logout sends only a null token", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("android");
    mockNativePlugin();
    const { clearFcmToken } = await import("./fcm");
    await clearFcmToken("a-jwt");
    expect(tokenBodies()).toEqual([{ fcm_token: null }]);
  });
});
