/**
 * Where the address map opens (SVC-281).
 *
 * The property that matters most here is a negative one: this must **never**
 * cause a permission prompt. On Android a location denial is one-shot — the OS
 * will not ask again and recovery means digging through system settings — so a
 * prompt the user did not ask for spends something we cannot get back.
 * `LocationBar` avoids auto-prompting for exactly this reason, and a hook that
 * quietly reintroduced it would undo that decision invisibly.
 *
 * The rest is fallback behaviour, all of which has to degrade rather than block
 * the map from rendering at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getCurrentPosition = vi.fn();
const permissionsQuery = vi.fn();

import { useMapOpeningCentre } from "@/hooks/useMapOpeningCentre";

const BANGALORE: [number, number] = [12.9716, 77.5946];
const PUNE = { latitude: 18.5204, longitude: 73.8567 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", {
    geolocation: { getCurrentPosition },
    permissions: { query: permissionsQuery },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("permission already granted", () => {
  it("opens on the user's actual position", async () => {
    permissionsQuery.mockResolvedValue({ state: "granted" });
    getCurrentPosition.mockImplementation((ok) => ok({ coords: PUNE }));

    const { result } = renderHook(() => useMapOpeningCentre());

    await waitFor(() => expect(result.current.centre).not.toBeNull());
    expect(result.current.centre).toEqual([PUNE.latitude, PUNE.longitude]);
    expect(result.current.source).toBe("position");
  });
});

describe("permission not yet granted", () => {
  it("does NOT ask for a position — that would fire the OS prompt", async () => {
    // The load-bearing assertion. "prompt" means the user has not decided; a
    // getCurrentPosition call here would decide for them, and on Android a
    // denial cannot be re-asked.
    permissionsQuery.mockResolvedValue({ state: "prompt" });

    const { result } = renderHook(() => useMapOpeningCentre());

    await waitFor(() => expect(result.current.centre).not.toBeNull());
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(result.current.source).toBe("fallback");
  });

  it("does not ask when permission was denied either", async () => {
    permissionsQuery.mockResolvedValue({ state: "denied" });

    const { result } = renderHook(() => useMapOpeningCentre());

    await waitFor(() => expect(result.current.centre).not.toBeNull());
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe("when the Permissions API can't answer", () => {
  it("falls back rather than guessing, when the API is missing", async () => {
    // Some Android WebViews have no navigator.permissions at all. Unknown must
    // mean "don't ask", not "ask and see".
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useMapOpeningCentre());

    await waitFor(() => expect(result.current.centre).not.toBeNull());
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(result.current.centre).toEqual(BANGALORE);
  });

  it("falls back when the query throws", async () => {
    permissionsQuery.mockRejectedValue(new Error("unsupported descriptor"));

    const { result } = renderHook(() => useMapOpeningCentre());

    await waitFor(() => expect(result.current.centre).not.toBeNull());
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(result.current.source).toBe("fallback");
  });
});

describe("when a granted position still fails", () => {
  it("falls back instead of leaving the map unmounted forever", async () => {
    // Permission granted but the fix times out — indoors, airplane mode, a
    // flaky GPS. Returning null here would leave `centre` null and the sheet
    // stuck on a spinner with no way forward.
    permissionsQuery.mockResolvedValue({ state: "granted" });
    getCurrentPosition.mockImplementation((_ok, fail) => fail({ code: 3 }));

    const { result } = renderHook(() => useMapOpeningCentre());

    await waitFor(() => expect(result.current.centre).not.toBeNull());
    expect(result.current.centre).toEqual(BANGALORE);
    expect(result.current.source).toBe("fallback");
  });
});

describe("the fallback", () => {
  it("names the city it is showing", async () => {
    permissionsQuery.mockResolvedValue({ state: "prompt" });

    const { result } = renderHook(() => useMapOpeningCentre());

    await waitFor(() => expect(result.current.source).toBe("fallback"));
    // So the UI can say "Showing Bangalore" rather than presenting a map of
    // the wrong city as though it were the user's own.
    expect(result.current.fallbackLabel).toBe("Bangalore");
  });
});
