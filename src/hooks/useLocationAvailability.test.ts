/**
 * Can we locate the user? (SVC-281)
 *
 * One sentence has to hold: **a user whose location is switched on never sees
 * the gate.** Four attempts broke it, and the cause turned out to be the web
 * geolocation API rather than the logic on top — see `lib/geolocation.ts`.
 *
 * This hook is now thin: it asks `requestLocation` and maps the failure to the
 * reason the gate's copy is written against. The tests are about that mapping
 * and about *when* the question is asked, which is where the bugs actually
 * were.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const requestLocation = vi.fn();
const canProbeWithoutGesture = vi.fn();
vi.mock("@/lib/geolocation", () => ({
  requestLocation: (...args: unknown[]) => requestLocation(...args),
  canProbeWithoutGesture: () => canProbeWithoutGesture(),
}));

import { useLocationAvailability } from "@/hooks/useLocationAvailability";

beforeEach(() => {
  vi.clearAllMocks();
  // Everywhere but iOS Safari. The skip has its own describe block below.
  canProbeWithoutGesture.mockReturnValue(true);
});

describe("a user whose location works", () => {
  it("is never gated", async () => {
    requestLocation.mockResolvedValue({ ok: true, failure: null });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(false);
    expect(result.current.reason).toBeNull();
  });
});

describe("naming what is actually wrong", () => {
  // The whole point of moving to the plugin: the web API could not tell these
  // apart, so the gate guessed and often guessed wrong. Each remedy is
  // different, and sending someone to the wrong settings screen wastes a trip.
  it.each([
    ["location-disabled", "device-off"],
    ["permission-denied", "permission-denied"],
    ["permission-prompt", "permission-prompt"],
    ["unavailable", "unknown"],
  ])("maps %s to %s", async (failure, reason) => {
    requestLocation.mockResolvedValue({ ok: false, failure });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe(reason);
  });
});

describe("a timeout is not an answer", () => {
  it("retries, and does not gate a user who answers late", async () => {
    // Found on device with the plugin in place: the same phone, location
    // switched on throughout, answered in 130ms on one cold launch and not
    // within ten seconds on the next — the GPS was still coming up. Treating
    // that first timeout as "cannot locate" gated a working user, which is the
    // same bug this hook has now had four times in four different disguises.
    requestLocation
      .mockResolvedValueOnce({ ok: false, failure: "timeout", coords: null })
      .mockResolvedValueOnce({ ok: true, failure: null, coords: { lat: 18.5, lng: 73.8 } });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(false);
    expect(requestLocation).toHaveBeenCalledTimes(2);
  });

  it("gives up eventually rather than asking forever", async () => {
    requestLocation.mockResolvedValue({ ok: false, failure: "timeout", coords: null });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    // "Where are you?" — out of patience, not out of permission, so the copy
    // must not name a fix we have no evidence for.
    expect(result.current.reason).toBe("unknown");
  });

  it("does not retry a real answer", async () => {
    // A refusal or a disabled toggle is information. Asking again would only
    // delay the gate the user needs.
    requestLocation.mockResolvedValue({ ok: false, failure: "location-disabled", coords: null });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(requestLocation).toHaveBeenCalledOnce();
  });
});

describe("the request itself", () => {
  it("is patient enough for a cold GPS and a human", async () => {
    // Measured on device before the plugin, location on throughout:
    // consecutive cold starts answered in 1ms, 43ms, 836ms and 8256ms. This
    // call can also raise the native permission dialog, which a person has to
    // read. Affordable because nothing is blocked while it runs.
    requestLocation.mockResolvedValue({ ok: true, failure: null });

    const { result } = renderHook(() => useLocationAvailability());
    await waitFor(() => expect(result.current.isResolving).toBe(false));

    expect(requestLocation.mock.calls[0][0]).toBeGreaterThanOrEqual(9_000);
  });
});

describe("when the question is asked", () => {
  it("does not ask until enabled", async () => {
    // The answer resolves once and is kept, so *when* decides what the user
    // sees all session. AppGate mounts on the login screen, before any session
    // exists — asking there produced a stale "cannot locate" that survived
    // login. Found on device.
    requestLocation.mockResolvedValue({ ok: true, failure: null });

    const { result } = renderHook(() => useLocationAvailability(false));

    expect(requestLocation).not.toHaveBeenCalled();
    // Still resolving rather than "available": callers must not act on an
    // answer nobody has sought.
    expect(result.current.isResolving).toBe(true);
  });

  it("asks once enabled turns true", async () => {
    requestLocation.mockResolvedValue({ ok: true, failure: null });

    const { result, rerender } = renderHook(({ enabled }) => useLocationAvailability(enabled), {
      initialProps: { enabled: false },
    });
    expect(requestLocation).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(false);
  });

  it("asks once, not on every render", async () => {
    // Re-asking mid-session could drop a gate the user is part-way through
    // answering, and would re-raise the permission dialog.
    requestLocation.mockResolvedValue({ ok: true, failure: null });

    const { result, rerender } = renderHook(() => useLocationAvailability(true));
    await waitFor(() => expect(result.current.isResolving).toBe(false));

    rerender();
    rerender();

    expect(requestLocation).toHaveBeenCalledOnce();
  });
});

/**
 * iOS Safari refuses a position request that no user gesture initiated, and
 * reports it as PERMISSION_DENIED — the same code a real refusal produces
 * (SVC-319). Probing there answers the question on the user's behalf, wrongly:
 * reported from a home-screen PWA with Location Services switched ON, the gate
 * was already showing the denial banner before the user could tap anything.
 */
describe("where a request needs a user gesture", () => {
  beforeEach(() => {
    canProbeWithoutGesture.mockReturnValue(false);
  });

  it("does not ask, so nothing can answer for the user", async () => {
    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(requestLocation).not.toHaveBeenCalled();
  });

  it("reports available, so the gate opens neutral rather than denied", async () => {
    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    // `blocked: false` keeps the app rendering for someone who has an address,
    // and leaves `reason` null so the gate reads "Where are you?" with no red
    // banner for someone who does not. The Enable tap is the gesture Safari
    // wants, and it still raises the real prompt.
    expect(result.current.blocked).toBe(false);
    expect(result.current.reason).toBeNull();
  });
});
