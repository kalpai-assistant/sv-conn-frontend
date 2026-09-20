/**
 * The payout row on Provider Home (SVC-275, retargeted by SVC-303).
 *
 * Two things are worth pinning here, and neither is "it renders a number".
 *
 * The first is that a **failed fetch never shows ₹0**. That is the one wrong
 * answer this row can give: a provider owed ₹2,900 reading ₹0 because a request
 * timed out has been told something false about their own money, and unlike a
 * spinner it looks authoritative. React's own fallbacks push you there —
 * `data?.pending_amount ?? 0` is the natural thing to write and is exactly the
 * bug — so the guard needs a test that fails if someone simplifies it back.
 *
 * The second is that the row carries **one figure**, and that it is the **net**
 * one. Showing the gross here while the bank sends the net is the exact gap
 * SVC-303 exists to close, so a test pins which field feeds this row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// `to` is a Router prop, not a DOM one — React drops it from a plain <a>, so
// the mock surfaces it as data-to for the destination assertion below.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a data-to={String(to)} {...props}>
      {children}
    </a>
  ),
}));

const useProviderPayoutSummary = vi.fn();
vi.mock("@/hooks/useApi", () => ({
  useProviderPayoutSummary: () => useProviderPayoutSummary(),
}));

import { EarningsRow } from "@/components/provider/EarningsRow";

const loaded = (pending_amount: number, gross_amount = pending_amount) => ({
  data: {
    pending_amount,
    gross_amount,
    balance_owed: 0,
    pending_booking_count: 3,
    last_paid_at: null,
    last_paid_amount: null,
    payout_set: true,
  },
  isLoading: false,
  isError: false,
});

beforeEach(() => vi.clearAllMocks());

describe("the figure", () => {
  it("renders the payable figure in Indian grouping", () => {
    useProviderPayoutSummary.mockReturnValue(loaded(48250));
    render(<EarningsRow />);

    // ₹48,250 — not ₹48.250 and not the US ₹48,250.00. Indian grouping only
    // diverges above ₹1,00,000, which is why the wrong locale survives review.
    expect(screen.getByText("₹48,250")).toBeInTheDocument();
  });

  it("shows the net, not the gross — the whole point of SVC-303", () => {
    // ₹3,480 of queued work, ₹2,900 actually transferring after cash
    // commission and the T+1 gate. Home must agree with the bank.
    useProviderPayoutSummary.mockReturnValue(loaded(2900, 3480));
    render(<EarningsRow />);

    expect(screen.getByText("₹2,900")).toBeInTheDocument();
    expect(screen.queryByText("₹3,480")).not.toBeInTheDocument();
  });

  it("groups a figure above a lakh the Indian way", () => {
    useProviderPayoutSummary.mockReturnValue(loaded(1250000));
    render(<EarningsRow />);

    expect(screen.getByText("₹12,50,000")).toBeInTheDocument();
    expect(screen.queryByText("₹1,250,000")).not.toBeInTheDocument();
  });

  it("shows ₹0 for a provider with nothing queued", () => {
    // Honest, and distinct from the error case below — which is the whole point.
    useProviderPayoutSummary.mockReturnValue(loaded(0, 0));
    render(<EarningsRow />);

    expect(screen.getByText("₹0")).toBeInTheDocument();
  });

  it("carries exactly one figure, never a second window alongside it", () => {
    useProviderPayoutSummary.mockReturnValue(loaded(48250));
    const { container } = render(<EarningsRow />);

    const rupeeFigures = (container.textContent ?? "").match(/₹[\d,]+/g) ?? [];
    expect(rupeeFigures).toEqual(["₹48,250"]);
  });
});

describe("when the fetch fails", () => {
  it("shows no rupee figure at all", () => {
    useProviderPayoutSummary.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container } = render(<EarningsRow />);

    // The assertion that matters: not "it shows an error", but that it does not
    // quietly answer the question wrongly.
    expect(container.textContent).not.toMatch(/₹/);
  });

  it("stays tappable, so the tab is still reachable", () => {
    useProviderPayoutSummary.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container } = render(<EarningsRow />);

    // Queried as an element rather than by role: the mocked Link renders an
    // <a> with no href, and an anchor without one carries no link role.
    expect(container.querySelector("a")).toHaveAttribute("data-to", "/provider/earnings");
  });
});

describe("while loading", () => {
  it("shows no figure yet, and does not fall back to zero", () => {
    useProviderPayoutSummary.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<EarningsRow />);

    expect(container.textContent).not.toMatch(/₹/);
    // The label stays, so the row does not change height when the number lands.
    expect(screen.getByText(/coming to you/i)).toBeInTheDocument();
  });
});
