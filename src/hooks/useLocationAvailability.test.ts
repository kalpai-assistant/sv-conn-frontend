/**
 * Can we locate the user? (SVC-281)
 *
 * One sentence has to hold: **a user whose location is switched on never sees
 * the gate.** Four attempts broke it, and the cause turned out to be the web
 * geolocation API rather than the logic on top — see `lib/geolocation.ts`.
 *
 * This hook is now thin: it reads `probeLocation` and maps the failure to the
 * reason the gate's copy is written against. The tests are about that mapping,
 * about *when* the question is asked, which is where the bugs actually were,
 * and about it never asking for permission (SVC-281 AC4).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const probeLocation = vi.fn();
const requestLocation = vi.fn();
const canProbeWithoutGesture = vi.fn();
const peekBrowserPermission = vi.fn();
vi.mock("@/lib/geolocation", () => ({
  probeLocation: (...args: unknown[]) => probeLocation(...args),
  requestLocation: (...args: unknown[]) => requestLocation(...args),
  canProbeWithoutGesture: () => canProbeWithoutGesture(),
  peekBrowserPermission: () => peekBrowserPermission(),
}));

import { useLocationAvailability } from "@/hooks/useLocationAvailability";

beforeEach(() => {
  vi.clearAllMocks();
  // Everywhere but iOS Safari. The read-instead-of-ask path has its own
  // describe block below.
  canProbeWithoutGesture.mockReturnValue(true);
  peekBrowserPermission.mockResolvedValue(null);
});

describe("a user whose location works", () => {
  it("is never gated", async () => {
    probeLocation.mockResolvedValue({ ok: true, failure: null });

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
    probeLocation.mockResolvedValue({ ok: false, failure });

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
    probeLocation
      .mockResolvedValueOnce({ ok: false, failure: "timeout", coords: null })
      .mockResolvedValueOnce({ ok: true, failure: null, coords: { lat: 18.5, lng: 73.8 } });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(false);
    expect(probeLocation).toHaveBeenCalledTimes(2);
  });

  it("gives up eventually rather than asking forever", async () => {
    probeLocation.mockResolvedValue({ ok: false, failure: "timeout", coords: null });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    // "Where are you?" — out of patience, not out of permission, so the copy
    // must not name a fix we have no evidence for.
    expect(result.current.reason).toBe("unknown");
  });

  it("does not retry a real answer", async () => {
    // A refusal or a disabled toggle is information. Asking again would only
    // delay the gate the user needs.
    probeLocation.mockResolvedValue({ ok: false, failure: "location-disabled", coords: null });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(probeLocation).toHaveBeenCalledOnce();
  });
});

describe("the request itself", () => {
  it("is patient enough for a cold GPS", async () => {
    // Measured on device before the plugin, location on throughout:
    // consecutive cold starts answered in 1ms, 43ms, 836ms and 8256ms.
    // Affordable because nothing is blocked while it runs.
    probeLocation.mockResolvedValue({ ok: true, failure: null });

    const { result } = renderHook(() => useLocationAvailability());
    await waitFor(() => expect(result.current.isResolving).toBe(false));

    expect(probeLocation.mock.calls[0][0]).toBeGreaterThanOrEqual(9_000);
  });
});

describe("when the question is asked", () => {
  it("does not ask until enabled", async () => {
    // The answer resolves once and is kept, so *when* decides what the user
    // sees all session. AppGate mounts on the login screen, before any session
    // exists — asking there produced a stale "cannot locate" that survived
    // login. Found on device.
    probeLocation.mockResolvedValue({ ok: true, failure: null });

    const { result } = renderHook(() => useLocationAvailability(false));

    expect(probeLocation).not.toHaveBeenCalled();
    // Still resolving rather than "available": callers must not act on an
    // answer nobody has sought.
    expect(result.current.isResolving).toBe(true);
  });

  it("asks once enabled turns true", async () => {
    probeLocation.mockResolvedValue({ ok: true, failure: null });

    const { result, rerender } = renderHook(({ enabled }) => useLocationAvailability(enabled), {
      initialProps: { enabled: false },
    });
    expect(probeLocation).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(false);
  });

  it("asks once, not on every render", async () => {
    // Re-asking mid-session could drop a gate the user is part-way through
    // answering.
    probeLocation.mockResolvedValue({ ok: true, failure: null });

    const { result, rerender } = renderHook(() => useLocationAvailability(true));
    await waitFor(() => expect(result.current.isResolving).toBe(false));

    rerender();
    rerender();

    expect(probeLocation).toHaveBeenCalledOnce();
  });
});

/**
 * SVC-281 AC4: the OS permission dialog fires only on an explicit tap, never
 * on its own at launch. From #130 until this fix the launch probe called
 * `requestLocation`, which asks, and Android showed its dialog on the first
 * launches and after every "Only this time". `requestLocation` is the tap
 * path (the gate's Enable, the map's locate button); this hook must never
 * reach it, whatever the permission state.
 */
describe("the launch check never asks for permission", () => {
  it.each([
    ["never asked", { ok: false, failure: "permission-prompt", coords: null }, "permission-prompt"],
    ["refused", { ok: false, failure: "permission-denied", coords: null }, "permission-denied"],
    // Granted, but the position call fails: the OS toggle is off.
    [
      "granted, location off",
      { ok: false, failure: "location-disabled", coords: null },
      "device-off",
    ],
  ])("does not call requestLocation when %s", async (_state, probed, reason) => {
    probeLocation.mockResolvedValue(probed);

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.reason).toBe(reason);
    expect(requestLocation).not.toHaveBeenCalled();
  });

  it("does not call requestLocation when granted and located", async () => {
    probeLocation.mockResolvedValue({ ok: true, failure: null, coords: { lat: 18.5, lng: 73.8 } });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(false);
    expect(requestLocation).not.toHaveBeenCalled();
  });

  it("does not call requestLocation while retrying a timeout either", async () => {
    probeLocation.mockResolvedValue({ ok: false, failure: "timeout", coords: null });

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(probeLocation).toHaveBeenCalledTimes(3);
    expect(requestLocation).not.toHaveBeenCalled();
  });
});

/**
 * iOS Safari refuses a position request that no user gesture initiated, and
 * reports it as PERMISSION_DENIED — the same code a real refusal produces
 * (SVC-319). Probing there answers the question on the user's behalf, wrongly:
 * reported from a home-screen PWA with Location Services switched ON, the gate
 * was already showing the denial banner before the user could tap anything.
 */
describe("where a position cannot be asked for without a gesture", () => {
  // iOS Safari. It will not answer an ungestured `getCurrentPosition` — 6ms
  // and no prompt, measured on device — but it will answer
  // `permissions.query`, which costs nothing. So the launch check reads the
  // permission instead of asking for a fix.
  beforeEach(() => {
    canProbeWithoutGesture.mockReturnValue(false);
  });

  it("never requests a position, whatever the permission says", async () => {
    peekBrowserPermission.mockResolvedValue("granted");

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(probeLocation).not.toHaveBeenCalled();
  });

  it("keeps the gate down when the browser has already granted", async () => {
    peekBrowserPermission.mockResolvedValue("granted");

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(false);
    expect(result.current.reason).toBeNull();
  });

  it("names the remedy when the browser reports a refusal", async () => {
    peekBrowserPermission.mockResolvedValue("denied");

    const { result } = renderHook(() => useLocationAvailability());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.blocked).toBe(true);
    expect(result.current.reason).toBe("permission-denied");
  });

  it.each([["prompt"], [null]])(
    "blocks without accusing anyone when the browser says %s",
    async (state) => {
      // Measured on an iPhone: "prompt" is *also* what Safari reports when iOS
      // Location Services is switched off, so it cannot be read as "location
      // works" — the previous attempt did exactly that and let a user with
      // location off sail past the gate. Nor is it a refusal. `unknown` opens
      // on "Where are you?" with no error banner, and the tap decides.
      peekBrowserPermission.mockResolvedValue(state);

      const { result } = renderHook(() => useLocationAvailability());

      await waitFor(() => expect(result.current.isResolving).toBe(false));
      expect(result.current.blocked).toBe(true);
      expect(result.current.reason).toBe("unknown");
    },
  );
});
