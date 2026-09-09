/**
 * Can we locate the user? (SVC-281)
 *
 * Two properties here are load-bearing, and both are easy to erode later:
 *
 * 1. **It never prompts.** `getCurrentPosition` is called only when permission
 *    is already `granted`. On Android the OS dialog is one-shot, so firing it
 *    on launch — without the user asking — is how a permanent denial happens,
 *    and a denial cannot be re-requested from inside the app.
 * 2. **It never waits.** The probe reads a cached fix or fails immediately.
 *    Android does not report a disabled location toggle as an error — it just
 *    never answers — so waiting cannot tell "off" from "GPS still warming up",
 *    and trying stalls every launch. Measured on device; see the probe tests.
 *
 * A genuine unknown (no Permissions API, or it threw) still lets the user
 * through. A granted permission with no position does not: that is the exact
 * state the gate exists for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLocationAvailability } from "@/hooks/useLocationAvailability";

const getCurrentPosition = vi.fn();
const permissionsQuery = vi.fn();

/** Install a navigator with the given permission answer. */
function withPermission(state: PermissionState) {
  permissionsQuery.mockResolvedValue({ state });
  vi.stubGlobal("navigator", {
    geolocation: { getCurrentPosition },
    permissions: { query: permissionsQuery },
  });
}

const PUNE = { coords: { latitude: 18.5204, longitude: 73.8567 } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("permission granted", () => {
  it("is available when a position comes back", async () => {
    withPermission("granted");
    getCurrentPosition.mockImplementation((ok) => ok(PUNE));

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(false);
    expect(result.current.reason).toBeNull();
  });

  it("reports the device toggle when no position is available", async () => {
    // The only way to detect this at all: no web API reports whether Location
    // is switched on in Android settings. Permission stays `granted` either
    // way, so a failed call is the sole signal.
    //
    // code 2 is POSITION_UNAVAILABLE, which is what you would expect a
    // disabled toggle to raise. Android does not send it — see the probe
    // tests below — but any failure means the same thing here, so both are
    // covered rather than assuming a code.
    withPermission("granted");
    getCurrentPosition.mockImplementation((_ok, fail) => fail({ code: 2 }));

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("device-off");
  });
});

describe("permission not granted", () => {
  it("blocks on prompt without asking the OS", async () => {
    withPermission("prompt");

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("permission-prompt");
    // The property, not an implementation detail. Spending the one-shot
    // Android dialog on launch — before the user has tapped anything — is how
    // a permanent denial happens, and the gate's Enable button is the place
    // that spend is supposed to occur.
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("blocks on denied, and does not retry a call the OS will refuse", async () => {
    withPermission("denied");

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("permission-denied");
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe("when the browser cannot tell us", () => {
  it("treats a missing Permissions API as unknown rather than probing", async () => {
    // Absent on some Android WebViews. "We do not know" is a reason of its
    // own — not licence to call getCurrentPosition and find out, which would
    // prompt.
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("unknown");
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("treats a throwing Permissions API the same way", async () => {
    permissionsQuery.mockRejectedValue(new Error("not supported"));
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition },
      permissions: { query: permissionsQuery },
    });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("unknown");
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("blocks when geolocation is missing entirely", async () => {
    vi.stubGlobal("navigator", {});

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("unknown");
  });
});

describe("the probe never waits for a fix", () => {
  it("asks for a cached position only, so launch cannot stall", async () => {
    // This is the hook's central design decision, and it came from a device,
    // not from reasoning. Measured on Samsung/Android 14/Chrome 152:
    //
    //   OS location off      → TIMEOUT (code 3), never code 2, and it waits
    //                          out whatever timeout you give it (5s, 20s…)
    //   OS location on, cold → success after ~5.0s
    //   OS location on, warm → success in ~1ms
    //
    // Android never reports a disabled toggle as an error, so "off" and "cold
    // GPS" are separated by about 30ms of luck. Any threshold between them is
    // a coin flip that also stalls every launch behind a spinner.
    //
    // `timeout: 0` removes the guess entirely: the OS answers from cache or
    // fails immediately, and the hardware is never woken. Measured at 1ms to
    // succeed and 3ms to fail.
    withPermission("granted");
    getCurrentPosition.mockImplementation((ok) => ok(PUNE));

    const { result } = renderHook(() => useLocationAvailability());
    await waitFor(() => expect(result.current.isResolving).toBe(false));

    const options = getCurrentPosition.mock.calls[0][2];
    expect(options.timeout).toBe(0);
    // Without a non-zero maximumAge, `timeout: 0` would reject even a fix the
    // OS is holding — which would gate every user on every launch.
    expect(options.maximumAge).toBeGreaterThan(0);
  });

  it("treats a granted permission with no cached fix as the device being off", async () => {
    // Deliberately gates the cold-start case too: location on but nothing
    // cached is indistinguishable from location off, at any speed worth
    // waiting for.
    //
    // Accepted, because the gate is not a punishment — it offers "Use my
    // current location", and the slow GPS acquisition then happens behind a
    // spinner the user asked for. A five-second mystery stall on launch is
    // worse than one extra tap, and unlike the stall it explains itself.
    withPermission("granted");
    getCurrentPosition.mockImplementation((_ok, fail) => fail({ code: 3 }));

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("device-off");
  });
});

describe("while resolving", () => {
  it("reports isResolving so the caller shows a spinner, not the gate", () => {
    withPermission("granted");
    getCurrentPosition.mockImplementation((ok) => ok(PUNE));

    const { result } = renderHook(() => useLocationAvailability());

    // Synchronous first render: the permission read is async, so anything that
    // renders the gate on `blocked` alone would flash it on every launch —
    // exactly the screen we are trying to stop showing people.
    expect(result.current.isResolving).toBe(true);
    expect(result.current.blocked).toBe(false);
  });
});
