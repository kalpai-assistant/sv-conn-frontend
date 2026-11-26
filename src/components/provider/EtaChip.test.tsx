/**
 * SVC-493 — EtaChip failure modes this test file locks:
 *
 *   1. A provider sees a precise-looking ETA with no "approx"
 *      qualifier and commits to an arrival time they then miss.
 *      The tilde + hidden "approx" prefix must both be present.
 *
 *   2. A null/undefined/negative distance renders a fake "~1 min
 *      away" (the Math.ceil fallback) instead of honest "unknown".
 *
 *   3. A sub-km distance rounds down to zero and reads as "already
 *      here" — Math.max(1, …) must keep the display honest.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EtaChip } from "@/components/provider/EtaChip";

describe("EtaChip", () => {
  it("renders the approx prefix + tilde so the number can't be read as a promise", () => {
    render(<EtaChip distanceKm={2} />);
    // approx label + the tilde-in-minutes together carry the "guess, not promise"
    // frame.
    expect(screen.getByText(/approx/i)).toBeInTheDocument();
    expect(screen.getByText(/~\d+ min away/i)).toBeInTheDocument();
  });

  it("shows unavailable state for null distance so no fake ETA leaks through", () => {
    render(<EtaChip distanceKm={null} />);
    expect(screen.getByText(/distance unknown/i)).toBeInTheDocument();
    // Must NOT render a minutes string with a null input.
    expect(screen.queryByText(/min away/i)).toBeNull();
  });

  it("shows unavailable state for undefined distance (same null path)", () => {
    render(<EtaChip distanceKm={undefined} />);
    expect(screen.getByText(/distance unknown/i)).toBeInTheDocument();
  });

  it("shows unavailable state for a negative distance (clock-skew / bad server)", () => {
    render(<EtaChip distanceKm={-3} />);
    expect(screen.getByText(/distance unknown/i)).toBeInTheDocument();
  });

  it("rounds a sub-km distance up to 1 min so the chip never reads as 'already here'", () => {
    // 0.1 km / 30 kmh = 0.2 min — Math.max(1, …) keeps the floor honest.
    render(<EtaChip distanceKm={0.1} />);
    expect(screen.getByText(/~1 min away/i)).toBeInTheDocument();
  });

  it("uses Math.ceil so a borderline distance is pessimistic by default", () => {
    // 5 km at 30 kmh = 10 min exactly; 5.1 km = 10.2 min → ceil → 11 min.
    render(<EtaChip distanceKm={5.1} />);
    expect(screen.getByText(/~11 min away/i)).toBeInTheDocument();
  });
});
