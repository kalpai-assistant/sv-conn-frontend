/**
 * The provider location gate's saved-area row (SVC-309).
 *
 * This screen blocks the whole app by design: a provider who cannot get past it
 * cannot work. So the question these tests answer is **what keeps the one-tap
 * exit available**, and the answer that matters is that a third-party outage
 * must not be what removes it.
 *
 * The original rule showed the row only once a reverse-geocode had named the
 * area. That reads well until the geocoder is unreachable — and when the Maps
 * API key went missing, `useLocalityAt` returned null forever, so the row
 * simply never appeared. A provider with a perfectly good service area lost
 * their fastest way in, for a reason that had nothing to do with them and
 * nothing they could see.
 *
 * The fix is to degrade rather than disappear: offer the area under an honest
 * label when the name cannot be had. The original reasoning — "a row the
 * provider cannot disagree with is worse than one more tap" — still holds; it
 * argues for being truthful about what we don't know, not for vanishing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useLocalityAt } = vi.hoisted(() => ({ useLocalityAt: vi.fn() }));
vi.mock("@/hooks/useLocalityAt", () => ({ useLocalityAt }));

vi.mock("@/hooks/useApi", () => ({
  useUpdateServiceArea: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useLocationConfirmed", () => ({
  markLocationConfirmed: vi.fn(),
}));

import { ProviderLocationGate } from "@/components/LocationGateHost";

/** Pune coordinates, a set radius — a provider who is ready to work. */
const AREA = { lat: 18.4906, lng: 73.8145, radiusKm: 15, reason: null } as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("when the geocoder names the area", () => {
  it("offers it by name", () => {
    useLocalityAt.mockReturnValue({ status: "named", name: "Karve Nagar" });
    render(<ProviderLocationGate {...AREA} />);

    expect(screen.getByText("Karve Nagar")).toBeInTheDocument();
    expect(screen.getByText(/within 15 km/i)).toBeInTheDocument();
  });
});

describe("when the geocoder fails", () => {
  it("still offers the saved area — the outage is ours, not theirs", () => {
    // The SVC-309 case: a missing API key made this permanent, and the row
    // vanished for every provider on every load.
    useLocalityAt.mockReturnValue({ status: "failed", name: null });
    render(<ProviderLocationGate {...AREA} />);

    // Scoped to the row: the subtitle copy also mentions a service area, so
    // the radius is what identifies the tappable option.
    const row = screen.getByText(/within 15 km/i).closest("button, a, li, div");
    expect(row).not.toBeNull();
    expect(row?.textContent).toMatch(/your service area/i);
  });

  it("does not invent a place name", () => {
    // Honest beats helpful. The radius is what makes the row actionable when
    // the locality is unknown.
    useLocalityAt.mockReturnValue({ status: "failed", name: null });
    render(<ProviderLocationGate {...AREA} />);

    expect(screen.queryByText("Karve Nagar")).not.toBeInTheDocument();
  });

  it("offers it when the geocoder answers with no locality", () => {
    // Mid-ocean, an unmapped area, or a response with no named component.
    // Different cause from a failure, same right answer for the provider.
    useLocalityAt.mockReturnValue({ status: "unnamed", name: null });
    render(<ProviderLocationGate {...AREA} />);

    const row = screen.getByText(/within 15 km/i).closest("button, a, li, div");
    expect(row?.textContent).toMatch(/your service area/i);
  });
});

describe("while the lookup is still in flight", () => {
  it("withholds the row rather than flashing a placeholder", () => {
    // The one case where waiting is right: the real name may be milliseconds
    // away, and swapping "Your service area" for "Karve Nagar" under the
    // provider's thumb is worse than a brief absence.
    useLocalityAt.mockReturnValue({ status: "pending", name: null });
    render(<ProviderLocationGate {...AREA} />);

    expect(screen.queryByText(/within 15 km/i)).not.toBeInTheDocument();
  });
});

describe("when no service area is set", () => {
  it("offers no row, whatever the geocoder says", () => {
    // Nothing to confirm. This provider is excluded from every broadcast until
    // they set a centre, so the screen's job is to say that — not to offer a
    // one-tap confirmation of a point that does not exist.
    useLocalityAt.mockReturnValue({ status: "failed", name: null });
    render(<ProviderLocationGate lat={null} lng={null} radiusKm={15} reason={null} />);

    expect(screen.queryByText(/within 15 km/i)).not.toBeInTheDocument();
    expect(screen.getByText(/set your service area/i)).toBeInTheDocument();
  });
});
