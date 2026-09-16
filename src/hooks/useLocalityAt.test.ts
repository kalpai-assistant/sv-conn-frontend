/**
 * Naming a provider's service area (SVC-281, SVC-284).
 *
 * A service area is a point and a radius — no address text exists for it. That
 * left the location gate's row reading "your saved service area": a
 * placeholder, true wherever the provider is standing, confirming nothing.
 * Found on device.
 *
 * The failure mode to guard is not "no name" — the caller handles that by
 * withholding the row. It is a name that *looks* like an answer while being
 * unfalsifiable. Since SVC-284 the reverse-geocode goes through Google, so the
 * mock is on `@/lib/google-maps` rather than `fetch`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Hoisted so the factory below sees the same `vi.fn()` as the tests do —
// vi.mock lifts to the top of the file, ahead of any plain top-level const.
const { reverseGeocode } = vi.hoisted(() => ({ reverseGeocode: vi.fn() }));
vi.mock("@/lib/google-maps", () => ({
  reverseGeocode,
}));

import { useLocalityAt } from "@/hooks/useLocalityAt";

/** Build a Google-shaped components array from a `{ type: long_name }` map. */
function components(entries: Record<string, string>): google.maps.GeocoderAddressComponent[] {
  return Object.entries(entries).map(([type, long_name]) => ({
    long_name,
    short_name: long_name,
    types: [type],
  })) as google.maps.GeocoderAddressComponent[];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("with coordinates", () => {
  it("names the sublocality — 'Kharadi' for a Kharadi pin (SVC-284)", async () => {
    // The measured device case. Nominatim used to return "Pune" from the
    // string parse; Google marks the sublocality directly.
    reverseGeocode.mockResolvedValue({
      formattedAddress: "Lane Number 1, Kharadi, Pune, Maharashtra 411014, India",
      components: components({
        route: "Lane Number 1",
        sublocality_level_1: "Kharadi",
        locality: "Pune",
        country: "India",
      }),
    });

    const { result } = renderHook(() => useLocalityAt(18.5541343, 73.9351687));

    await waitFor(() => expect(result.current).toBe("Kharadi"));
  });

  it("falls through to the locality when no sublocality is present", async () => {
    reverseGeocode.mockResolvedValue({
      formattedAddress: "MG Road, Bangalore, Karnataka, India",
      components: components({ route: "MG Road", locality: "Bangalore" }),
    });

    const { result } = renderHook(() => useLocalityAt(12.9716, 77.5946));

    await waitFor(() => expect(result.current).toBe("Bangalore"));
  });
});

describe("without coordinates", () => {
  it("asks nothing", () => {
    const { result } = renderHook(() => useLocalityAt(null, null));

    expect(result.current).toBeNull();
    expect(reverseGeocode).not.toHaveBeenCalled();
  });
});

describe("when the geocoder is unreachable", () => {
  it("returns null rather than hanging", async () => {
    // Offline, rate-limited, key missing, or Google rejected. This screen
    // blocks by design, so a slow geocoder must never be what keeps a provider
    // out of the app — the caller degrades to the other exits.
    reverseGeocode.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useLocalityAt(18.5204, 73.8567));

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("treats no results as no answer", async () => {
    // Mid-ocean, or an unmapped area. Google returns `null` from our
    // reverseGeocode wrapper.
    reverseGeocode.mockResolvedValue(null);

    const { result } = renderHook(() => useLocalityAt(18.5204, 73.8567));

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("treats an empty components array as no answer", async () => {
    // A response with no useful named types would otherwise render an empty
    // button label.
    reverseGeocode.mockResolvedValue({
      formattedAddress: "somewhere",
      components: [],
    });

    const { result } = renderHook(() => useLocalityAt(18.5204, 73.8567));

    await waitFor(() => expect(result.current).toBeNull());
  });
});
