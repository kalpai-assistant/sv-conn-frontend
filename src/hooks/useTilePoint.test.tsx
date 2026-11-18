/**
 * SVC-415: where the tiles price from, and the silent refresh on resume.
 *
 * The refresh's whole contract is what it must NOT do: prompt (no
 * requestPermissions / requestLocation, ever), run for a pinned address, run
 * more than once per 30 min, or drop a fix it failed to replace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  selected: undefined as { lat: number | null; lng: number | null } | undefined,
  isLoading: false,
}));

const peekLocationPermission = vi.fn();
const peekCurrentPosition = vi.fn();
const requestLocation = vi.fn();
const requestPermissions = vi.fn();

vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({ selected: h.selected, isLoading: h.isLoading }),
}));
vi.mock("@/lib/geolocation", () => ({
  peekLocationPermission: () => peekLocationPermission(),
  peekCurrentPosition: (...a: unknown[]) => peekCurrentPosition(...a),
  requestLocation: (...a: unknown[]) => requestLocation(...a),
}));
vi.mock("@capacitor/geolocation", () => ({
  Geolocation: { requestPermissions: () => requestPermissions() },
}));
// Web path only: the native listener is the same refresh behind another event.
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { useLaunchFixRefresh, useTilePoint } from "@/hooks/useTilePoint";
import {
  FIX_MAX_AGE_MS,
  REFRESH_AFTER_MS,
  getLaunchFix,
  resetLaunchFix,
  setLaunchFix,
} from "@/lib/tile-location";

const MIN = 60 * 1000;
const T0 = new Date("2026-11-18T10:00:00Z").getTime();

function resume() {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  resetLaunchFix();
  h.selected = undefined;
  h.isLoading = false;
  peekLocationPermission.mockResolvedValue("granted");
  peekCurrentPosition.mockResolvedValue({ lat: 18.52, lng: 73.85 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTilePoint", () => {
  it("uses the selected address when it has coordinates, over a fix", () => {
    h.selected = { lat: 12.9, lng: 77.6 };
    setLaunchFix({ lat: 18.5, lng: 73.8 }, T0);
    const { result } = renderHook(() => useTilePoint());
    expect(result.current).toEqual({ lat: 12.9, lng: 77.6 });
  });

  it("falls to a fresh launch fix when the address has no coordinates", () => {
    h.selected = { lat: null, lng: null };
    setLaunchFix({ lat: 18.5, lng: 73.8 }, T0 - 90 * MIN);
    const { result } = renderHook(() => useTilePoint());
    expect(result.current).toEqual({ lat: 18.5, lng: 73.8 });
  });

  it("ignores a fix older than 2 h", () => {
    setLaunchFix({ lat: 18.5, lng: 73.8 }, T0 - FIX_MAX_AGE_MS - 1);
    const { result } = renderHook(() => useTilePoint());
    expect(result.current).toBeNull();
  });

  it("is null with no address and no fix", () => {
    const { result } = renderHook(() => useTilePoint());
    expect(result.current).toBeNull();
  });

  it("picks up a fix stored after mount", () => {
    const { result } = renderHook(() => useTilePoint());
    expect(result.current).toBeNull();
    act(() => setLaunchFix({ lat: 18.5, lng: 73.8 }, T0));
    expect(result.current).toEqual({ lat: 18.5, lng: 73.8 });
  });
});

describe("useLaunchFixRefresh", () => {
  it("is not called with a pinned address", async () => {
    h.selected = { lat: 12.9, lng: 77.6 };
    setLaunchFix({ lat: 18.5, lng: 73.8 }, T0 - 60 * MIN);
    renderHook(() => useLaunchFixRefresh());
    resume();
    await Promise.resolve();
    expect(peekLocationPermission).not.toHaveBeenCalled();
    expect(peekCurrentPosition).not.toHaveBeenCalled();
  });

  it("does nothing while the fix is under 30 min old", async () => {
    setLaunchFix({ lat: 18.5, lng: 73.8 }, T0 - REFRESH_AFTER_MS + MIN);
    renderHook(() => useLaunchFixRefresh());
    resume();
    await Promise.resolve();
    expect(peekLocationPermission).not.toHaveBeenCalled();
  });

  it("replaces an old fix when permission is already granted", async () => {
    setLaunchFix({ lat: 18.5, lng: 73.8 }, T0 - 40 * MIN);
    renderHook(() => useLaunchFixRefresh());
    resume();
    await waitFor(() => expect(getLaunchFix()).toEqual({ lat: 18.52, lng: 73.85, at: T0 }));
  });

  it.each(["denied", "prompt"])("makes no position call when the peek says %s", async (state) => {
    peekLocationPermission.mockResolvedValue(state);
    setLaunchFix({ lat: 18.5, lng: 73.8 }, T0 - 40 * MIN);
    renderHook(() => useLaunchFixRefresh());
    resume();
    await waitFor(() => expect(peekLocationPermission).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(peekCurrentPosition).not.toHaveBeenCalled();
  });

  it("keeps the old fix when the position call fails", async () => {
    peekCurrentPosition.mockResolvedValue(null);
    setLaunchFix({ lat: 18.5, lng: 73.8 }, T0 - 40 * MIN);
    renderHook(() => useLaunchFixRefresh());
    resume();
    await waitFor(() => expect(peekCurrentPosition).toHaveBeenCalledTimes(1));
    expect(getLaunchFix()).toEqual({ lat: 18.5, lng: 73.8, at: T0 - 40 * MIN });
  });

  it("never prompts: no requestLocation, no requestPermissions", async () => {
    setLaunchFix({ lat: 18.5, lng: 73.8 }, T0 - 40 * MIN);
    renderHook(() => useLaunchFixRefresh());
    resume();
    await waitFor(() => expect(peekCurrentPosition).toHaveBeenCalledTimes(1));
    expect(requestLocation).not.toHaveBeenCalled();
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("tries once with no fix, then not again within 30 min", async () => {
    peekCurrentPosition.mockResolvedValue(null);
    renderHook(() => useLaunchFixRefresh());

    resume();
    await waitFor(() => expect(peekCurrentPosition).toHaveBeenCalledTimes(1));

    vi.setSystemTime(T0 + 5 * MIN);
    resume();
    await Promise.resolve();
    expect(peekLocationPermission).toHaveBeenCalledTimes(1);

    vi.setSystemTime(T0 + REFRESH_AFTER_MS);
    resume();
    await waitFor(() => expect(peekLocationPermission).toHaveBeenCalledTimes(2));
  });
});
