/**
 * Naming a provider's service area (SVC-281).
 *
 * A service area is a point and a radius — no address text exists for it. That
 * left the location gate's row reading "your saved service area": a
 * placeholder, true wherever the provider is standing, confirming nothing.
 * Found on device.
 *
 * The failure mode to guard is not "no name" — the caller handles that by
 * withholding the row. It is a name that *looks* like an answer while being
 * unfalsifiable.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLocalityAt } from "@/hooks/useLocalityAt";

const PUNE_DISPLAY =
  "Lane Number 7, Mavale vasti, Karve Nagar, Anandnagar, Pune City Subdistrict, Pune District, Maharashtra, 411051, India";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("with coordinates", () => {
  it("names the neighbourhood", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ display_name: PUNE_DISPLAY }) }),
    );

    const { result } = renderHook(() => useLocalityAt(18.5204, 73.8567));

    await waitFor(() => expect(result.current).toBe("Karve Nagar"));
  });

  it("prefers the structured suburb over parsing the string (SVC-284)", async () => {
    // The Kharadi response, as the live API returns it. Parsing the string
    // gives "Pune" — one fewer street-level part than Karve Nagar, so the
    // fixed index overshoots. The `address` object names it outright, and we
    // were already receiving one.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          display_name: "Lane Number 1, Kharadi, Pune, Pune City Subdistrict, Maharashtra, India",
          address: { road: "Lane Number 1", suburb: "Kharadi", city: "Pune" },
        }),
      }),
    );

    const { result } = renderHook(() => useLocalityAt(18.5541343, 73.9351687));

    await waitFor(() => expect(result.current).toBe("Kharadi"));
  });

  it("still parses the string when no structured address comes back", async () => {
    // Older cached responses and any geocoder answer without `address`. The
    // string path is the fallback, not dead code.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ display_name: PUNE_DISPLAY }) }),
    );

    const { result } = renderHook(() => useLocalityAt(18.5204, 73.8567));

    await waitFor(() => expect(result.current).toBe("Karve Nagar"));
  });
});

describe("without coordinates", () => {
  it("asks nothing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useLocalityAt(null, null));

    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("when the geocoder is unreachable", () => {
  it("returns null rather than hanging", async () => {
    // Offline, rate-limited or blocked. This screen blocks by design, so a
    // slow geocoder must never be what keeps a provider out of the app — the
    // caller degrades to the other two exits.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { result } = renderHook(() => useLocalityAt(18.5204, 73.8567));

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("treats an empty answer as no answer", async () => {
    // A blank display_name would otherwise render an empty button label.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({}) }));

    const { result } = renderHook(() => useLocalityAt(18.5204, 73.8567));

    await waitFor(() => expect(result.current).toBeNull());
  });
});
