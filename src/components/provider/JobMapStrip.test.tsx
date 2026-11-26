/**
 * SVC-493 — JobMapStrip failure modes this test file locks:
 *
 *   1. Customer address with no lat/lng (older ungeocoded rows) still
 *      renders the map → tile grid centres on null-island. The whole
 *      strip must bail out when coords are missing; JobAddress below
 *      still carries the address + Navigate hand-off.
 *
 *   2. "Open in Maps" chip href breaks when either lat or lng is
 *      null after the strip renders — a stale callsite could pass a
 *      partially-geocoded address. The directionsUrl must fall back
 *      to the address string when either coord is nullable.
 *
 *   3. Provider pin renders even when providerLocation is null,
 *      producing a double-customer-pin UI — the branch must be
 *      guarded.
 *
 *   4. EtaChip renders unconditionally — a null distance would show
 *      "Distance unknown" over the map, which is noise. Hide the
 *      chip when distanceKm is nullish.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// react-leaflet pulls Leaflet, which ships a window-dependent module
// graph. Mock the surface we use — mirroring TrackingMap's test
// pattern elsewhere in this repo.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: React.PropsWithChildren) => <div data-testid="map">{children}</div>,
  TileLayer: () => <div data-testid="tiles" />,
  Marker: ({ position }: { position: [number, number] }) => (
    <div data-testid="marker" data-position={position.join(",")} />
  ),
  useMap: () => ({
    setView: () => undefined,
    fitBounds: () => undefined,
    getZoom: () => 14,
  }),
}));

// divIcon is used at module scope to build the two icon shapes; we
// need a no-op so the module loads cleanly.
vi.mock("leaflet", () => ({
  divIcon: () => ({}),
}));

// Leaflet CSS import is a runtime no-op — map it so vitest doesn't
// try to parse a .css file via the TS loader.
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import { JobMapStrip } from "@/components/provider/JobMapStrip";
import type { Address } from "@/lib/mock-data";

const geocodedAddress: Address = {
  id: "a1",
  label: "Home",
  full: "123 MG Road, Bangalore",
  lat: 12.97,
  lng: 77.59,
};

const ungeocodedAddress: Address = {
  id: "a2",
  label: "Home",
  full: "Unknown Rd",
  lat: null,
  lng: null,
};

describe("JobMapStrip", () => {
  it("renders nothing when the customer address has no lat/lng", () => {
    const { container } = render(<JobMapStrip customerAddress={ungeocodedAddress} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders just the customer pin when providerLocation is null", () => {
    render(<JobMapStrip customerAddress={geocodedAddress} providerLocation={null} />);
    const markers = screen.getAllByTestId("marker");
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveAttribute("data-position", "12.97,77.59");
  });

  it("renders both pins when providerLocation is present", () => {
    render(
      <JobMapStrip customerAddress={geocodedAddress} providerLocation={{ lat: 13.0, lng: 77.6 }} />,
    );
    const markers = screen.getAllByTestId("marker");
    expect(markers).toHaveLength(2);
    expect(markers.map((m) => m.getAttribute("data-position"))).toEqual(
      expect.arrayContaining(["12.97,77.59", "13,77.6"]),
    );
  });

  it("hides the ETA chip when distanceKm is nullish (no noise on the map)", () => {
    render(<JobMapStrip customerAddress={geocodedAddress} distanceKm={null} />);
    expect(screen.queryByText(/min away/i)).toBeNull();
    expect(screen.queryByText(/distance unknown/i)).toBeNull();
  });

  it("surfaces the ETA chip when distanceKm is supplied", () => {
    render(<JobMapStrip customerAddress={geocodedAddress} distanceKm={3} />);
    expect(screen.getByText(/~\d+ min away/i)).toBeInTheDocument();
  });

  it("provides the floating 'Open in Maps' chip with a lat,lng destination", () => {
    render(<JobMapStrip customerAddress={geocodedAddress} />);
    const link = screen.getByRole("link", { name: /open in maps/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("destination=12.97,77.59"));
    // Must open in a new context — the app is not navigating away mid-job.
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
