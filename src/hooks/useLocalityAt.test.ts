/**
 * Naming a provider's service area (SVC-281, SVC-284).
 *
 * A service area is a point and a radius — no address text exists for it. That
 * left the location gate's row reading "your saved service area": a
 * placeholder, true wherever the provider is standing, confirming nothing.
 * Found on device.
 *
 * The failure mode to guard is not "no name" — the caller handles that with an
 * honest fallback label. It is a name that *looks* like an answer while being
 * unfalsifiable. Since SVC-284 the reverse-geocode goes through Google, so the
 * mock is on `@/lib/google-maps` rather than `fetch`.
 *
 * SVC-309 widened the return from `string | null` to a status. The distinction
 * that earns its keep: **failed** and **unnamed** must not look alike to the
 * caller. A geocoder outage says nothing about whether the provider's saved
 * service area is usable, and collapsing the two is what made a missing API key
 * remove their one-tap row entirely.
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

    await waitFor(() => expect(result.current).toEqual({ status: "named", name: "Kharadi" }));
  });

  it("falls through to the locality when no sublocality is present", async () => {
    reverseGeocode.mockResolvedValue({
      formattedAddress: "MG Road, Bangalore, Karnataka, India",
      components: components({ route: "MG Road", locality: "Bangalore" }),
    });

    const { result } = renderHook(() => useLocalityAt(12.9716, 77.5946));

    await waitFor(() => expect(result.current).toEqual({ status: "named", name: "Bangalore" }));
  });
});

describe("without coordinates", () => {
  it("asks nothing", () => {
    const { result } = renderHook(() => useLocalityAt(null, null));

    expect(result.current).toEqual({ status: "pending", name: null });
    expect(reverseGeocode).not.toHaveBeenCalled();
  });
});

describe("when the geocoder is unreachable", () => {
  it("reports failure, distinctly from having no name", async () => {
    // Offline, rate-limited, key missing, or Google rejected. This screen
    // blocks by design, so a geocoder outage must never be what keeps a
    // provider out of the app — the caller keeps offering their saved area
    // under a neutral label, which it can only do if it can see this status.
    reverseGeocode.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useLocalityAt(18.5204, 73.8567));

    await waitFor(() => expect(result.current).toEqual({ status: "failed", name: null }));
  });

  it("treats no results as no answer", async () => {
    // Mid-ocean, or an unmapped area. Google returns `null` from our
    // reverseGeocode wrapper.
    reverseGeocode.mockResolvedValue(null);

    const { result } = renderHook(() => useLocalityAt(18.5204, 73.8567));

    await waitFor(() => expect(result.current).toEqual({ status: "unnamed", name: null }));
  });

  it("treats an empty components array as no answer", async () => {
    // A response with no useful named types would otherwise render an empty
    // button label.
    reverseGeocode.mockResolvedValue({
      formattedAddress: "somewhere",
      components: [],
    });

    const { result } = renderHook(() => useLocalityAt(18.5204, 73.8567));

    await waitFor(() => expect(result.current).toEqual({ status: "unnamed", name: null }));
  });

  it("never reports a name it did not get", async () => {
    // The whole point of the status: a caller must be able to trust that
    // `name` is non-null only when the geocoder actually said so.
    reverseGeocode.mockRejectedValue(new Error("rate limited"));

    const { result } = renderHook(() => useLocalityAt(18.5204, 73.8567));

    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.name).toBeNull();
  });
});

describe("when the coordinates change", () => {
  it("does not show the previous point's name against the new one", async () => {
    reverseGeocode.mockResolvedValue({
      formattedAddress: "Kharadi",
      components: components({ sublocality_level_1: "Kharadi" }),
    });

    const { result, rerender } = renderHook(({ lat, lng }) => useLocalityAt(lat, lng), {
      initialProps: { lat: 18.5541343, lng: 73.9351687 },
    });
    await waitFor(() => expect(result.current.name).toBe("Kharadi"));

    // A provider who moves their service area must not see the old locality
    // sitting under the new pin while the second lookup is in flight.
    reverseGeocode.mockImplementation(() => new Promise(() => {}));
    rerender({ lat: 12.9716, lng: 77.5946 });

    expect(result.current).toEqual({ status: "pending", name: null });
  });
});
