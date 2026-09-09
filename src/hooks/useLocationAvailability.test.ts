/**
 * Can we locate the user? (SVC-281)
 *
 * Two properties here are load-bearing, and both are easy to erode later:
 *
 * 1. **It never prompts.** `getCurrentPosition` is called only when permission
 *    is already `granted`. On Android the OS dialog is one-shot, so firing it
 *    on launch — without the user asking — is how a permanent denial happens,
 *    and a denial cannot be re-requested from inside the app.
 * 2. **It fails open.** Every unknown resolves to "not blocked". A spurious
 *    gate blocks someone who is perfectly locatable, which is the exact
 *    complaint that prompted this whole change.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
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

  it("reports the device toggle when the position fails", async () => {
    // The only way to detect this at all: no web API reports whether Location
    // is switched on in Android settings. Permission stays `granted` either
    // way, so a failed call is the sole signal.
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

describe("a position call that never answers", () => {
  it("gives up and lets the user through rather than gating them", async () => {
    // The hook's one real risk: the probe runs on every launch for a granted
    // user, and a WebView that calls neither callback would otherwise leave
    // the app on a spinner forever.
    //
    // Resolving to *available* is deliberate. Guessing "device-off" on a slow
    // fix would gate someone whose location works perfectly — reintroducing
    // the complaint this change exists to fix.
    vi.useFakeTimers();
    try {
      withPermission("granted");
      getCurrentPosition.mockImplementation(() => {
        /* never calls back */
      });

      const { result } = renderHook(() => useLocationAvailability());
      await vi.waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());

      // Inside act: the timeout resolves a promise whose .then sets state, and
      // an update React never commits would look like the hook hanging.
      await act(() => vi.advanceTimersByTimeAsync(6_000));

      expect(result.current.isResolving).toBe(false);
      expect(result.current.blocked).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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
