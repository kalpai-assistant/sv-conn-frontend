/**
 * SVC-494 · ServiceMixDonut unit tests.
 *
 * Donut aggregates earnings by service_name; caps slices at 5 + "other".
 * Each case names the regression it catches. Pie render is mocked; we
 * assert the aggregation shape and null-safety rules.
 */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("recharts", () => ({
  Cell: () => null,
  Pie: () => null,
  PieChart: ({ children }: { children?: ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
}));
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/i18n/LanguageProvider", () => ({
  useT: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key;
      return `${key}:${JSON.stringify(params)}`;
    },
    lang: "en" as const,
  }),
}));
vi.mock("@/i18n/format", () => ({
  formatRupees: (n: number) => `₹${n.toLocaleString("en-IN")}`,
}));
vi.mock("@/lib/earnings-ranges", () => ({
  rangeMeta: (range: string) => ({ inline: range }),
}));

import { aggregateMix, ServiceMixDonut } from "./ServiceMixDonut";
import type { API_EarningsBookingItem } from "@/hooks/useApi";

function bookingItem(overrides: Partial<API_EarningsBookingItem> = {}): API_EarningsBookingItem {
  return {
    booking_id: "b1",
    service_name: "AC Repair",
    payout_amount: 500,
    completed_at: "2026-11-24T10:00:00Z",
    payment_method: "online",
    settlement_status: "settled",
    tip_amount: 0,
    ...overrides,
  } as API_EarningsBookingItem;
}

describe("aggregateMix", () => {
  // Catches: "empty bookings returns a one-slice '0% other' instead of
  // an empty array — donut renders with zero values and looks broken."
  it("returns an empty array for no bookings", () => {
    expect(aggregateMix([], (c) => `${c} other`)).toEqual([]);
  });

  // Catches: "duplicate service names create duplicate slices instead
  // of aggregating — the same service shows twice in the legend."
  it("sums earnings per service_name", () => {
    const slices = aggregateMix(
      [
        bookingItem({ service_name: "AC Repair", payout_amount: 500 }),
        bookingItem({ service_name: "AC Repair", payout_amount: 300 }),
        bookingItem({ service_name: "TV Repair", payout_amount: 200 }),
      ],
      (c) => `${c} other`,
    );
    expect(slices).toHaveLength(2);
    const ac = slices.find((s) => s.label === "AC Repair");
    expect(ac?.value).toBe(800);
  });

  // Catches: "slices aren't sorted — provider's biggest earner lands
  // mid-donut, breaking the 'top services first' reading order."
  it("sorts slices by value descending", () => {
    const slices = aggregateMix(
      [
        bookingItem({ service_name: "Small", payout_amount: 100 }),
        bookingItem({ service_name: "Big", payout_amount: 1000 }),
        bookingItem({ service_name: "Medium", payout_amount: 500 }),
      ],
      (c) => `${c} other`,
    );
    expect(slices.map((s) => s.label)).toEqual(["Big", "Medium", "Small"]);
  });

  // Catches: "tail of 6+ services renders as 6+ arcs — unreadable on
  // a phone. Must collapse to 'other'."
  it("collapses the tail past the 5-slice cap into an 'other' bucket", () => {
    const slices = aggregateMix(
      [
        bookingItem({ service_name: "A", payout_amount: 600 }),
        bookingItem({ service_name: "B", payout_amount: 500 }),
        bookingItem({ service_name: "C", payout_amount: 400 }),
        bookingItem({ service_name: "D", payout_amount: 300 }),
        bookingItem({ service_name: "E", payout_amount: 200 }),
        bookingItem({ service_name: "F", payout_amount: 100 }),
        bookingItem({ service_name: "G", payout_amount: 50 }),
      ],
      (c) => `${c} other services`,
    );
    expect(slices).toHaveLength(6);
    const other = slices[5];
    expect(other.key).toBe("__other__");
    expect(other.value).toBe(150);
    expect(other.label).toBe("2 other services");
  });
});

describe("ServiceMixDonut component", () => {
  // Catches: "empty bookings render an empty donut — noise on a window
  // with no completed work."
  it("renders nothing when there are no bookings", () => {
    const { container } = render(<ServiceMixDonut range="week" bookings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  // Catches: "undefined bookings crashes or renders — a loading window
  // shows a broken donut below it."
  it("renders nothing when bookings is undefined", () => {
    const { container } = render(<ServiceMixDonut range="week" bookings={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  // Catches: "donut renders but legend drops the service labels — the
  // key signal (which service earns the most) is lost."
  it("renders the legend with each service_name and percentage", () => {
    render(
      <ServiceMixDonut
        range="week"
        bookings={[
          bookingItem({ service_name: "AC Repair", payout_amount: 800 }),
          bookingItem({ service_name: "TV Repair", payout_amount: 200 }),
        ]}
      />,
    );
    expect(screen.getByText("AC Repair")).toBeInTheDocument();
    expect(screen.getByText("TV Repair")).toBeInTheDocument();
    // Legend's percentage bar is present (AC = 80%, TV = 20%).
    expect(screen.getByText(/80%/)).toBeInTheDocument();
    expect(screen.getByText(/20%/)).toBeInTheDocument();
  });
});
