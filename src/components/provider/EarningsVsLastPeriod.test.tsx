/**
 * SVC-494 · EarningsVsLastPeriod unit tests.
 *
 * Within-window momentum chip. Each case names the regression it catches.
 * The chip's whole job is to not lie — zero, error, empty, or
 * backend-not-shifted must all collapse to null, not to "0% vs last".
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const earnings = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useEarnings: () => earnings(),
}));
vi.mock("@/i18n/LanguageProvider", () => ({
  useT: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key;
      // Reflect params into the output so copy assertions can match.
      return `${key}: ${JSON.stringify(params)}`;
    },
    lang: "en" as const,
  }),
}));
vi.mock("@/lib/earnings-ranges", () => ({
  rangeMeta: (range: string) => ({ inline: range }),
}));

import { EarningsVsLastPeriod, classifyDelta, previousRange } from "./EarningsVsLastPeriod";

function Wrap({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

beforeEach(() => {
  earnings.mockReset();
});

describe("previousRange", () => {
  // Catches: "today sprouts a shifted peer when it shouldn't — chip
  // claims a comparison the backend can't answer and the midpoint math
  // can't either (a single-day window has one midpoint)."
  it("returns null for today and week/month for themselves", () => {
    expect(previousRange("today")).toBeNull();
    expect(previousRange("week")).toBe("week");
    expect(previousRange("month")).toBe("month");
  });
});

describe("classifyDelta", () => {
  // Catches: "zero-vs-zero shows 'Same' instead of 'new/same' default —
  // misleading on a first-window provider."
  it("maps 0/0 to 'same' pct=0", () => {
    expect(classifyDelta(0, 0)).toEqual({ kind: "same", pct: 0 });
  });

  // Catches: "first-earning provider sees '+Infinity%' (previous=0, current>0)
  // instead of the dedicated 'new' copy."
  it("maps previous=0, current>0 to 'new'", () => {
    expect(classifyDelta(500, 0)).toEqual({ kind: "new", pct: 0 });
  });

  // Catches: "tiny arithmetic drift (0.25%) shows as a positive delta —
  // reads as motion when there is none."
  it("collapses |pct| < 1% to 'same'", () => {
    expect(classifyDelta(4010, 4000)).toEqual({ kind: "same", pct: 0 });
  });

  // Catches: "down windows aren't signed — provider sees '-50%' and
  // reads it as a positive."
  it("maps a down window to kind=down with positive pct", () => {
    expect(classifyDelta(50, 100)).toEqual({ kind: "down", pct: 50 });
  });

  it("maps an up window to kind=up with positive pct", () => {
    expect(classifyDelta(150, 100)).toEqual({ kind: "up", pct: 50 });
  });
});

describe("EarningsVsLastPeriod component", () => {
  // Catches: "chip renders on today, lies about a peer that doesn't exist."
  it("renders nothing on 'today' (no peer)", () => {
    earnings.mockReturnValue({
      data: { bookings: [{ completed_at: "2026-11-23T10:00:00Z", payout_amount: 100 }] },
      isLoading: false,
      isError: false,
    });
    const { container } = render(
      <Wrap>
        <EarningsVsLastPeriod range="today" />
      </Wrap>,
    );
    expect(container.firstChild).toBeNull();
  });

  // Catches: "chip shows a stale figure during loading — midpoint math on
  // whatever bookings are in flight renders a flash."
  it("renders nothing while loading", () => {
    earnings.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(
      <Wrap>
        <EarningsVsLastPeriod range="week" />
      </Wrap>,
    );
    expect(container.firstChild).toBeNull();
  });

  // Catches: "chip lies on error — '0% vs last week' is the one wrong
  // answer here, matching the earnings tab's null-safety discipline."
  it("renders nothing on fetch error", () => {
    earnings.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container } = render(
      <Wrap>
        <EarningsVsLastPeriod range="week" />
      </Wrap>,
    );
    expect(container.firstChild).toBeNull();
  });

  // Catches: "empty window renders a chip saying 'same' or '0%' — reads
  // as 'you earned nothing twice' which is wrong (you earned nothing once)."
  it("renders nothing on an empty window", () => {
    earnings.mockReturnValue({
      data: { bookings: [] },
      isLoading: false,
      isError: false,
    });
    const { container } = render(
      <Wrap>
        <EarningsVsLastPeriod range="week" />
      </Wrap>,
    );
    expect(container.firstChild).toBeNull();
  });

  // Catches: "up chip renders wrong direction indicator / palette —
  // provider reads a down window as motion in the right direction."
  it("renders the up chip when the second half of the window out-earned the first", () => {
    earnings.mockReturnValue({
      data: {
        bookings: [
          { completed_at: "2026-11-23T10:00:00Z", payout_amount: 100 },
          { completed_at: "2026-11-23T11:00:00Z", payout_amount: 100 },
          { completed_at: "2026-11-25T10:00:00Z", payout_amount: 300 },
          { completed_at: "2026-11-25T12:00:00Z", payout_amount: 300 },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(
      <Wrap>
        <EarningsVsLastPeriod range="week" />
      </Wrap>,
    );
    const chip = screen.getByTestId("vs-last-period");
    expect(chip).toHaveAttribute("data-direction", "up");
  });
});
