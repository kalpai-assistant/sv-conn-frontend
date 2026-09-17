/**
 * The month chart (SVC-260).
 *
 * The thing this component exists to solve is that 31 bars leave no room for
 * day labels, so the readout strip and the tap are not decoration — they are
 * the entire answer to "which day was that?". Those are what is tested here.
 *
 * jsdom reports every element as 0×0 and recharts lays out from measured size,
 * so the bars do not render here. The readout and the accessible summary do,
 * and between them they carry every figure the chart conveys — which is the
 * property worth having anyway.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { MonthEarningsChart } from "@/components/provider/MonthEarningsChart";

const job = (completed_at: string, payout_amount: number) => ({
  booking_id: Math.random().toString(36).slice(2),
  service_name: "Bathroom deep cleaning",
  completed_at,
  payout_amount,
  tip_amount: 0,
});

// Two separate days in the current month. Dates are resolved against the real
// clock inside the component, so these are built relative to now.
function twoDaysThisMonth() {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  // The 2nd and 3rd at midday IST — safely inside every month, and never
  // adjacent to a boundary that the IST shift could push out.
  const at = (day: number) => new Date(Date.UTC(y, m, day, 6, 30)).toISOString();
  return [job(at(2), 349), job(at(3), 559)];
}

describe("when it declines to render", () => {
  it("renders nothing for an empty month", () => {
    const { container } = render(<MonthEarningsChart bookings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("when a month holds only one earning day", () => {
  it("still renders", () => {
    const [one] = twoDaysThisMonth();
    render(<MonthEarningsChart bookings={[one]} />);
    expect(screen.getByText(/tap a bar/i)).toBeInTheDocument();
  });

  it("rests the readout on that day, since it is also the best one", () => {
    const [one] = twoDaysThisMonth();
    render(<MonthEarningsChart bookings={[one]} />);

    const readouts = screen.getAllByText(/₹349/).filter((el) => !el.closest(".sr-only"));
    expect(readouts).toHaveLength(1);
  });
});

describe("the readout, where a 9px bar cannot label itself", () => {
  it("rests on the best day rather than sitting blank", () => {
    render(<MonthEarningsChart bookings={twoDaysThisMonth()} />);

    // ₹559 is the taller of the two, so the strip explains the tallest bar
    // without the provider having to tap anything. Scoped away from the
    // sr-only summary, which carries every amount.
    const readouts = screen.getAllByText(/₹559/).filter((el) => !el.closest(".sr-only"));
    expect(readouts).toHaveLength(1);
  });

  it("tells the provider the bars are tappable", () => {
    render(<MonthEarningsChart bookings={twoDaysThisMonth()} />);
    expect(screen.getByText(/tap a bar/i)).toBeInTheDocument();
  });
});

describe("the axis endpoints", () => {
  it("anchors the span with three dates instead of an unreadable tick row", () => {
    render(<MonthEarningsChart bookings={twoDaysThisMonth()} />);

    const now = new Date();
    const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
    const last = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 0)).getUTCDate();

    expect(screen.getByText(/^1 \w{3}$/)).toBeInTheDocument();
    expect(screen.getByText(String(last))).toBeInTheDocument();
    expect(screen.getByText(String(Math.ceil(last / 2)))).toBeInTheDocument();
  });
});

describe("the accessible summary", () => {
  it("names every earning day and its total", () => {
    render(<MonthEarningsChart bookings={twoDaysThisMonth()} />);

    const summary = screen.getByText(/₹349/, { selector: ".sr-only" });
    expect(summary.textContent).toMatch(/₹349/);
    expect(summary.textContent).toMatch(/₹559/);
  });

  it("omits the empty days rather than reading thirty zeros aloud", () => {
    render(<MonthEarningsChart bookings={twoDaysThisMonth()} />);

    const summary = screen.getByText(/₹349/, { selector: ".sr-only" });
    expect(summary.textContent).not.toMatch(/₹0/);
  });
});

describe("robustness", () => {
  it("survives a malformed timestamp", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<MonthEarningsChart bookings={[...twoDaysThisMonth(), job("not a date", 999)]} />),
    ).not.toThrow();
    spy.mockRestore();
  });
});
