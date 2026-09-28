/**
 * The PWA path (SVC-318).
 *
 * On web the Capacitor plugin delegates straight to `navigator.geolocation`
 * and rejects with the browser's own `GeolocationPositionError`, whose `code`
 * is numeric — not one of the `GLOC-xxxx` strings the native path sends. It
 * also has no `requestPermissions`: the web implementation throws
 * `unimplemented`, because the browser raises its prompt from
 * `getCurrentPosition` itself.
 *
 * Both of those arrive at `classify` as "something we have no case for", which
 * is how an iOS home-screen PWA with location working ends up on the gate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentPosition = vi.fn();
const checkPermissions = vi.fn();
const requestPermissions = vi.fn();

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    getCurrentPosition: (...a: unknown[]) => getCurrentPosition(...a),
    checkPermissions: () => checkPermissions(),
    requestPermissions: () => requestPermissions(),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { requestLocation } from "@/lib/geolocation";

/** A browser GeolocationPositionError, as Safari actually rejects with. */
const positionError = (code: number, message: string) => ({ code, message });

/** What @capacitor/core's `unimplemented()` builds. */
const unimplemented = () =>
  Object.assign(new Error("Not implemented on web."), { code: "Unimplemented" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("web PositionError codes", () => {
  it("treats POSITION_UNAVAILABLE as a timeout, so it is retried not believed", async () => {
    checkPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    getCurrentPosition.mockRejectedValue(positionError(2, "Position unavailable"));

    const result = await requestLocation(1000);

    // Code 2 is iOS's "I could not get a fix right now" — transient. Calling
    // it `unavailable` makes the gate say "we don't know why", permanently.
    expect(result.failure).toBe("timeout");
  });

  it("still maps PERMISSION_DENIED (1) and TIMEOUT (3)", async () => {
    checkPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });

    getCurrentPosition.mockRejectedValueOnce(positionError(1, "denied"));
    expect((await requestLocation(1000)).failure).toBe("permission-denied");

    getCurrentPosition.mockRejectedValueOnce(positionError(3, "timeout"));
    expect((await requestLocation(1000)).failure).toBe("timeout");
  });
});

describe("web has no requestPermissions", () => {
  it("falls through to getCurrentPosition instead of failing on unimplemented", async () => {
    // Safari reports "prompt" until the user answers, and the prompt is only
    // raised BY getCurrentPosition — so this is the ordinary first-run state.
    checkPermissions.mockResolvedValue({ location: "prompt", coarseLocation: "prompt" });
    requestPermissions.mockRejectedValue(unimplemented());
    getCurrentPosition.mockResolvedValue({
      coords: { latitude: 18.5204, longitude: 73.8567 },
    });

    const result = await requestLocation(1000);

    expect(result.ok).toBe(true);
    expect(result.coords).toEqual({ lat: 18.5204, lng: 73.8567 });
  });
});
