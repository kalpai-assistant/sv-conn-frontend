/**
 * The week chart's visibility rules (SVC-260).
 *
 * The chart is the one thing on this screen that can be *worse* than absent:
 * one bar and six flat lines occupies a card's worth of space to say
 * "Thursday", which the job row underneath already says along with the service,
 * the time and the amount. So what is tested here is mostly when it declines to
 * render.
 *
 * Recharts measures its container to lay out, and jsdom reports every element as
 * 0×0, so the bars themselves do not appear in this environment. That is why the
 * accessible summary is not merely an accessibility nicety — it is also the only
 * part of the rendered output a test can assert on, which conveniently means the
 * thing screen readers get is the thing under test.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { WeekEarningsChart } from "@/components/provider/WeekEarningsChart";

const job = (completed_at: string, payout_amount: number) => ({
  booking_id: Math.random().toString(36).slice(2),
  service_name: "Bathroom deep cleaning",
  completed_at,
  payout_amount,
  tip_amount: 0,
});

// Two separate IST days in the same week (Mon 14th, Thu 17th Sept 2026).
const TWO_DAYS = [job("2026-09-14T06:00:00Z", 349), job("2026-09-17T06:00:00Z", 559)];

describe("when it declines to render", () => {
  it("renders nothing for an empty week", () => {
    const { container } = render(<WeekEarningsChart bookings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("when a week holds only one earning day", () => {
  it("still renders, rather than leaving the provider wondering", () => {
    render(<WeekEarningsChart bookings={[job("2026-09-17T06:00:00Z", 349)]} />);
    expect(screen.getByText(/by day/i)).toBeInTheDocument();
  });

  it("names that day in the summary", () => {
    render(<WeekEarningsChart bookings={[job("2026-09-17T06:00:00Z", 349)]} />);
    expect(screen.getByText(/Thursday: ₹349/)).toBeInTheDocument();
  });
});

describe("when it renders", () => {
  it("appears for several earning days", () => {
    render(<WeekEarningsChart bookings={TWO_DAYS} />);
    expect(screen.getByText(/by day/i)).toBeInTheDocument();
  });

  it("names each earning day and its total for screen readers", () => {
    render(<WeekEarningsChart bookings={TWO_DAYS} />);

    // The chart is aria-hidden, so this text is the whole accessible content.
    expect(screen.getByText(/Monday: ₹349/)).toBeInTheDocument();
    expect(screen.getByText(/Thursday: ₹559/)).toBeInTheDocument();
  });

  it("leaves empty days out of the summary rather than reading seven zeros", () => {
    render(<WeekEarningsChart bookings={TWO_DAYS} />);

    const summary = screen.getByText(/Monday: ₹349/).textContent ?? "";
    expect(summary).not.toMatch(/Tuesday/);
    expect(summary).not.toMatch(/₹0/);
  });

  it("formats the summary in Indian grouping", () => {
    render(
      <WeekEarningsChart
        bookings={[job("2026-09-14T06:00:00Z", 125000), job("2026-09-17T06:00:00Z", 559)]}
      />,
    );

    expect(screen.getByText(/Monday: ₹1,25,000/)).toBeInTheDocument();
  });
});

describe("robustness", () => {
  it("survives a malformed timestamp without crashing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<WeekEarningsChart bookings={[...TWO_DAYS, job("not a date", 999)]} />),
    ).not.toThrow();
    spy.mockRestore();
  });

  it("does not let a malformed row inflate a real day", () => {
    render(<WeekEarningsChart bookings={[...TWO_DAYS, job("not a date", 999)]} />);

    // The bad row is dropped, so Monday stays at its own 349.
    expect(screen.getByText(/Monday: ₹349/)).toBeInTheDocument();
  });
});
