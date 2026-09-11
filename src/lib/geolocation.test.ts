/**
 * Turning device location on from inside the app (SVC-283).
 *
 * The unit here is the *contract with the plugin*, because that is where the
 * behaviour lives: which call reaches Play Services' settings check, and which
 * error code means which remedy. The dialog itself is native and only a device
 * can show it — that pass is recorded on the ticket.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const watchPosition = vi.fn();
const clearWatch = vi.fn();
const getCurrentPosition = vi.fn();
const checkPermissions = vi.fn();
const requestPermissions = vi.fn();

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    watchPosition: (...a: unknown[]) => watchPosition(...a),
    clearWatch: (...a: unknown[]) => clearWatch(...a),
    getCurrentPosition: (...a: unknown[]) => getCurrentPosition(...a),
    checkPermissions: () => checkPermissions(),
    requestPermissions: () => requestPermissions(),
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));

import { enableDeviceLocation, requestLocation } from "@/lib/geolocation";

const PUNE = { coords: { latitude: 18.5204, longitude: 73.8567 } };

/** Errors exactly as the plugin sends them. */
const err = (code: string, message = "") => ({ code, message });

beforeEach(() => {
  vi.clearAllMocks();
  clearWatch.mockResolvedValue(undefined);
});

describe("enabling device location", () => {
  it("asks through watchPosition, which is the only call that can offer", async () => {
    // getCurrentPosition, checkPermissions and requestPermissions are all
    // guarded by the plugin's checkLocationState and refuse with
    // LOCATION_DISABLED before anything can be raised. watchPosition is not,
    // and its path reaches Play Services' settings check — the dialog with the
    // "Turn on" button. Using any other call here would silently go back to
    // the dead end this ticket exists to remove.
    watchPosition.mockImplementation((_opts, cb) => {
      cb(PUNE, undefined);
      return Promise.resolve("watch-1");
    });

    const result = await enableDeviceLocation(5_000);

    expect(watchPosition).toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, coords: { lat: 18.5204, lng: 73.8567 } });
  });

  it("stops the watch when the answer arrives before the id", async () => {
    // A watch is a stream, not a one-shot. On the success path the plugin does
    // not clean up — verified on device, where the watch kept running until
    // cleared by hand.
    //
    // This ordering — callback first, then the id — is what the plugin
    // actually does, and it is why the id cannot simply be cleared in a
    // `finally`: there is nothing to clear yet when the promise settles.
    watchPosition.mockImplementation((_opts, cb) => {
      cb(PUNE, undefined);
      return Promise.resolve("watch-1");
    });

    await enableDeviceLocation(5_000);

    expect(clearWatch).toHaveBeenCalledWith({ id: "watch-1" });
  });

  it("stops the watch when the id arrives before the answer", async () => {
    // The other ordering, and the one the `finally` covers. Both exist, and a
    // version handling only one leaves the GPS running — which no test caught
    // until this pair was split apart.
    const emit: { cb?: (p: unknown, e?: unknown) => void } = {};
    watchPosition.mockImplementation((_opts, cb) => {
      emit.cb = cb;
      return Promise.resolve("watch-late");
    });

    // Short budget: if the emit is missed, this fails as a timeout result
    // rather than hanging until vitest kills the test.
    const pending = enableDeviceLocation(300);
    // Let watchPosition's promise resolve first, so watchId is set before the
    // callback fires.
    await Promise.resolve();
    await Promise.resolve();
    emit.cb?.(PUNE, undefined);

    await pending;

    expect(clearWatch).toHaveBeenCalledWith({ id: "watch-late" });
  });

  it("stops the watch after a failure too", async () => {
    watchPosition.mockImplementation((_opts, cb) => {
      cb(null, err("OS-PLUG-GLOC-0009", "Request to enable location was denied."));
      return Promise.resolve("watch-2");
    });

    await enableDeviceLocation(5_000);

    expect(clearWatch).toHaveBeenCalledWith({ id: "watch-2" });
  });

  it("survives clearWatch throwing", async () => {
    // The plugin drops the watch itself when the enable request is denied, so
    // clearing it afterwards reports "WatchId not found". That must not
    // surface as a failure to the caller.
    watchPosition.mockImplementation((_opts, cb) => {
      cb(null, err("OS-PLUG-GLOC-0009"));
      return Promise.resolve("watch-3");
    });
    clearWatch.mockRejectedValue(new Error("WatchId not found."));

    const result = await enableDeviceLocation(5_000);

    expect(result.ok).toBe(false);
    expect(result.failure).toBe("location-disabled");
  });

  it("gives up rather than hanging on an unanswered dialog", async () => {
    // The dialog waits on a human. Without a bound, a user who backgrounds the
    // app mid-prompt would leave the gate spinning forever.
    watchPosition.mockImplementation(() => Promise.resolve("watch-4"));

    const result = await enableDeviceLocation(50);

    expect(result.failure).toBe("timeout");
  });

  it("reports a rejected watch rather than throwing", async () => {
    watchPosition.mockRejectedValue(err("OS-PLUG-GLOC-0007", "Location services are not enabled."));

    const result = await enableDeviceLocation(5_000);

    expect(result).toMatchObject({ ok: false, failure: "location-disabled" });
  });
});

describe("classifying what went wrong", () => {
  it("treats a declined enable request as location still being off", async () => {
    // GLOC-0009 is LOCATION_ENABLE_REQUEST_DENIED — the user declined turning
    // *location* on, not the app's permission. Filing it as permission-denied
    // would name the wrong remedy and disable the Enable button, when tapping
    // it again is exactly what should work: the dialog can be raised as often
    // as we like.
    watchPosition.mockImplementation((_opts, cb) => {
      cb(null, err("OS-PLUG-GLOC-0009", "Request to enable location was denied."));
      return Promise.resolve("w");
    });

    const result = await enableDeviceLocation(5_000);

    expect(result.failure).toBe("location-disabled");
    expect(result.failure).not.toBe("permission-denied");
  });

  it("still treats a refused permission as a permission problem", async () => {
    // The other side of the same rule: GLOC-0003 is a real denial, and Android
    // will not ask twice.
    checkPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });
    requestPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });

    const result = await requestLocation(5_000);

    expect(result.failure).toBe("permission-denied");
  });
});
