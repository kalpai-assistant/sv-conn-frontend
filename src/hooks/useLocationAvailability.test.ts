/**
 * Can we locate the user? (SVC-281)
 *
 * Two properties here are load-bearing, and both are easy to erode later:
 *
 * 1. **It never prompts.** A WebView without geolocation permission fails the
 *    call rather than raising a dialog, and the probe is bounded so it cannot
 *    hang. On Android the OS dialog is one-shot, and firing it on launch —
 *    without the user asking — is how a permanent denial happens.
 * 2. **It barely waits.** Android does not report a disabled location toggle
 *    as an error — it simply never answers — so the probe is bounded. Measured
 *    on device with a cold cache: location on succeeds in ~92ms, location off
 *    waits out whatever timeout it is given. The bound sits far above the
 *    first and short enough that the second is a blink, not a stall.
 *
 * The probe also decides *whether* to gate; the permission state only explains
 * why. Inside a Capacitor WebView those two disagree — see the tests below.
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

describe("a cached fix wins over whatever the permission says", () => {
  it("does not gate a user whose location demonstrably works", async () => {
    // The bug this ordering fixes, found on device. Android reported
    // ACCESS_FINE_LOCATION granted=true and getCurrentPosition returned a fix
    // in 81ms — while navigator.permissions.query() still said "prompt",
    // because the OS grant and the WebView's own geolocation permission are
    // two separate things.
    //
    // Reading the permission first meant gating someone we could locate. The
    // probe is the honest signal, so it goes first and a fix ends the question.
    withPermission("prompt");
    getCurrentPosition.mockImplementation((ok) => ok(PUNE));

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(false);
    expect(result.current.reason).toBeNull();
  });

  it("does not even ask the Permissions API when a fix is available", async () => {
    // Not an optimisation — the point is that the permission state cannot
    // overrule evidence. If it is never read on this path, it cannot.
    withPermission("denied");
    getCurrentPosition.mockImplementation((ok) => ok(PUNE));

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(false);
    expect(permissionsQuery).not.toHaveBeenCalled();
  });
});

describe("no position, so the permission state explains why", () => {
  beforeEach(() => {
    // The probe runs first now and finds nothing; only then does the reason
    // matter. See "a cached fix wins" below for why the order is this way.
    getCurrentPosition.mockImplementation((_ok, fail) => fail({ code: 1 }));
  });

  it("blames the app permission when it was never asked for", async () => {
    withPermission("prompt");

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("permission-prompt");
  });

  it("blames the app permission when it was refused", async () => {
    withPermission("denied");

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("permission-denied");
  });

  it("never prompts, whatever the permission state", async () => {
    // The property that survived the reordering, and the one that matters.
    // Probing first is only safe because the call cannot raise a dialog: a
    // WebView without permission fails it outright. Spending Android's
    // one-shot prompt on launch, before the user taps anything, is how a
    // permanent denial happens; the gate's Enable button is where it belongs.
    for (const state of ["prompt", "denied", "granted"] as const) {
      vi.clearAllMocks();
      getCurrentPosition.mockImplementation((_ok, fail) => fail({ code: 1 }));
      withPermission(state);

      const { result, unmount } = renderHook(() => useLocationAvailability());
      await waitFor(() => expect(result.current.isResolving).toBe(false));

      expect(getCurrentPosition.mock.calls[0][2].timeout).toBeLessThanOrEqual(2000);
      unmount();
    }
  });
});

describe("when the browser cannot tell us", () => {
  it("treats a missing Permissions API as unknown", async () => {
    // Absent on some Android WebViews. With no position and no way to read the
    // permission, "we do not know" is the honest reason — the gate then asks a
    // neutral question rather than naming a fix that may not be the problem.
    getCurrentPosition.mockImplementation((_ok, fail) => fail({ code: 1 }));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("unknown");
  });

  it("treats a throwing Permissions API the same way", async () => {
    getCurrentPosition.mockImplementation((_ok, fail) => fail({ code: 1 }));
    permissionsQuery.mockRejectedValue(new Error("not supported"));
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition },
      permissions: { query: permissionsQuery },
    });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("unknown");
  });

  it("lets a cached fix through even when the permission is unreadable", async () => {
    // The device bug this reordering fixes, in its purest form: the WebView
    // could not report the permission, but location worked. Gating there is a
    // false positive against evidence.
    getCurrentPosition.mockImplementation((ok) => ok(PUNE));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(false);
  });

  it("blocks when geolocation is missing entirely", async () => {
    vi.stubGlobal("navigator", {});

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe("unknown");
  });
});

describe("the probe is bounded, and low accuracy", () => {
  it("waits long enough to succeed, briefly enough not to stall", async () => {
    // The hook's central number, and it came from a device twice.
    //
    // First pass used `timeout: 0` — cache or nothing — to guarantee launch
    // never stalls. That measured the *cache*, not the capability: on a fresh
    // install the cache is empty, so the probe failed in 3ms while a real
    // acquisition succeeded in 92ms. Users whose location worked were gated.
    //
    // Re-measured on Samsung/Android 14, cold cache, low accuracy:
    //
    //   location on   → success in ~92ms
    //   location off  → failure, waits out whatever timeout it is given
    //
    // So a short bound separates them cleanly. High accuracy is what made the
    // earlier numbers look hopeless (~5s cold): asking for a coarse fix is
    // both faster and sufficient, since the question is whether a position
    // exists at all, not where it is.
    withPermission("granted");
    getCurrentPosition.mockImplementation((ok) => ok(PUNE));

    const { result } = renderHook(() => useLocationAvailability());
    await waitFor(() => expect(result.current.isResolving).toBe(false));

    const options = getCurrentPosition.mock.calls[0][2];
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.timeout).toBeLessThanOrEqual(2000);
    // Coarse, and happy with a recent fix: both are what keep the common case
    // in the tens of milliseconds.
    expect(options.enableHighAccuracy).toBe(false);
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
