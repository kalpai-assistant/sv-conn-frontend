/**
 * The earnings row on Provider Home (SVC-275).
 *
 * Two things are worth pinning here, and neither is "it renders a number".
 *
 * The first is that a **failed fetch never shows ₹0**. That is the one wrong
 * answer this row can give: a provider who has earned ₹48,250 reading ₹0 because
 * a request timed out has been told something false about their own money, and
 * unlike a spinner it looks authoritative. React's own fallbacks push you there
 * — `data?.lifetime_payout ?? 0` is the natural thing to write and is exactly
 * the bug — so the guard needs a test that fails if someone simplifies it back.
 *
 * The second is that the row carries **one figure**. It is not a rendering
 * detail: a second number invites a comparison between a lifetime total and a
 * window that are not comparable, on a screen whose job is the work in hand.
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

const useEarningsSummary = vi.fn();
vi.mock("@/hooks/useApi", () => ({
  useEarningsSummary: () => useEarningsSummary(),
}));

import { EarningsRow } from "@/components/provider/EarningsRow";

const loaded = (lifetime_payout: number, completed_count = 3) => ({
  data: { lifetime_payout, completed_count },
  isLoading: false,
  isError: false,
});

beforeEach(() => vi.clearAllMocks());

describe("the figure", () => {
  it("renders the lifetime total in Indian grouping", () => {
    useEarningsSummary.mockReturnValue(loaded(48250));
    render(<EarningsRow />);

    // ₹48,250 — not ₹48.250 and not the US ₹48,250.00. Indian grouping only
    // diverges above ₹1,00,000, which is why the wrong locale survives review.
    expect(screen.getByText("₹48,250")).toBeInTheDocument();
  });

  it("groups a figure above a lakh the Indian way", () => {
    useEarningsSummary.mockReturnValue(loaded(1250000));
    render(<EarningsRow />);

    expect(screen.getByText("₹12,50,000")).toBeInTheDocument();
    expect(screen.queryByText("₹1,250,000")).not.toBeInTheDocument();
  });

  it("shows ₹0 for a provider who has completed nothing", () => {
    // Honest, and distinct from the error case below — which is the whole point.
    useEarningsSummary.mockReturnValue(loaded(0, 0));
    render(<EarningsRow />);

    expect(screen.getByText("₹0")).toBeInTheDocument();
  });

  it("carries exactly one figure, never a second window alongside it", () => {
    useEarningsSummary.mockReturnValue(loaded(48250));
    const { container } = render(<EarningsRow />);

    const rupeeFigures = (container.textContent ?? "").match(/₹[\d,]+/g) ?? [];
    expect(rupeeFigures).toEqual(["₹48,250"]);
  });
});

describe("when the fetch fails", () => {
  it("shows no rupee figure at all", () => {
    useEarningsSummary.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container } = render(<EarningsRow />);

    // The assertion that matters: not "it shows an error", but that it does not
    // quietly answer the question wrongly.
    expect(container.textContent).not.toMatch(/₹/);
  });

  it("stays tappable, so the tab is still reachable", () => {
    useEarningsSummary.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container } = render(<EarningsRow />);

    // Queried as an element rather than by role: the mocked Link renders an
    // <a> with no href, and an anchor without one carries no link role.
    expect(container.querySelector("a")).toHaveAttribute("data-to", "/provider/earnings");
  });
});

describe("while loading", () => {
  it("shows no figure yet, and does not fall back to zero", () => {
    useEarningsSummary.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<EarningsRow />);

    expect(container.textContent).not.toMatch(/₹/);
    // The label stays, so the row does not change height when the number lands.
    expect(screen.getByText(/total earned/i)).toBeInTheDocument();
  });
});
