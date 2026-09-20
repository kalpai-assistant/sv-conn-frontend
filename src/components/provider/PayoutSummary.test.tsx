/**
 * The payout block on the Earnings tab (SVC-303).
 *
 * The invariant this component exists for: **the figure on screen is what the
 * bank will send**, and whenever that is less than the jobs are worth, the
 * screen says why. A provider shown ₹3,480 who receives ₹2,900 has been misled
 * by their own app, and the netting lines are the whole defence against that.
 *
 * Two states displace the figure entirely, and both do so deliberately — in
 * each case the number alone would mislead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

import { PayoutSummary } from "@/components/provider/PayoutSummary";

const summary = (over: Record<string, unknown> = {}) => ({
  data: {
    pending_amount: 2900,
    gross_amount: 2900,
    balance_owed: 0,
    pending_booking_count: 4,
    last_paid_at: "2026-09-14T06:00:00Z",
    last_paid_amount: 44770,
    payout_set: true,
    ...over,
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  useProviderPayoutSummary.mockReturnValue(summary());
});

describe("the netting — why this block exists", () => {
  it("leads with what will actually be transferred", () => {
    useProviderPayoutSummary.mockReturnValue(summary({ pending_amount: 2900, gross_amount: 3480 }));
    render(<PayoutSummary />);

    expect(screen.getByText("₹2,900")).toBeInTheDocument();
  });

  it("names the difference rather than leaving it to the bank statement", () => {
    useProviderPayoutSummary.mockReturnValue(summary({ pending_amount: 2900, gross_amount: 3480 }));
    render(<PayoutSummary />);

    expect(screen.getByText("₹3,480")).toBeInTheDocument();
    expect(screen.getByText(/− ₹580/)).toBeInTheDocument();
    expect(screen.getByText(/held back/i)).toBeInTheDocument();
  });

  it("explains what was held back, in the provider's terms", () => {
    useProviderPayoutSummary.mockReturnValue(summary({ pending_amount: 2900, gross_amount: 3480 }));
    render(<PayoutSummary />);

    expect(screen.getByText(/cash commission/i)).toBeInTheDocument();
  });

  it("stays quiet when nothing was netted off", () => {
    // Equal figures on an all-online, fully settled week. A breakdown of
    // nothing is noise.
    render(<PayoutSummary />);

    expect(screen.queryByText(/held back/i)).not.toBeInTheDocument();
  });
});

describe("owing the platform", () => {
  it("says so plainly instead of showing a figure", () => {
    // After a run of cash work the commission can exceed online earnings, and
    // the payout sends nothing. Not an error — ordinary accounting.
    useProviderPayoutSummary.mockReturnValue(
      summary({ pending_amount: 0, gross_amount: 0, balance_owed: 640 }),
    );
    render(<PayoutSummary />);

    expect(screen.getByText(/nothing to transfer/i)).toBeInTheDocument();
    expect(screen.getByText(/₹640/)).toBeInTheDocument();
  });

  it("does not render a negative or a bare zero", () => {
    useProviderPayoutSummary.mockReturnValue(
      summary({ pending_amount: 0, gross_amount: 0, balance_owed: 640 }),
    );
    const { container } = render(<PayoutSummary />);

    expect(container.textContent).not.toMatch(/-₹|−₹640 coming/);
    expect(screen.queryByText(/coming to you/i)).not.toBeInTheDocument();
  });
});

describe("no payout method", () => {
  it("says the money is waiting, and how to fix it", () => {
    useProviderPayoutSummary.mockReturnValue(summary({ payout_set: false }));
    render(<PayoutSummary />);

    expect(screen.getByText(/waiting to be sent/i)).toBeInTheDocument();
    expect(screen.getByText(/add payout details/i)).toBeInTheDocument();
  });

  it("links into payout setup", () => {
    useProviderPayoutSummary.mockReturnValue(summary({ payout_set: false }));
    render(<PayoutSummary />);

    const cta = screen.getByText(/add payout details/i).closest("a");
    expect(cta).toHaveAttribute("data-to", "/provider/payout");
  });

  it("does not nag a provider with nothing pending", () => {
    // No destination and no money is not a problem to solve yet.
    useProviderPayoutSummary.mockReturnValue(
      summary({ payout_set: false, pending_amount: 0, gross_amount: 0 }),
    );
    render(<PayoutSummary />);

    expect(screen.queryByText(/waiting to be sent/i)).not.toBeInTheDocument();
  });
});

describe("last paid", () => {
  it("shows a past date, which is a fact", () => {
    render(<PayoutSummary />);

    expect(screen.getByText(/last 14 Sep/i)).toBeInTheDocument();
    expect(screen.getByText("₹44,770")).toBeInTheDocument();
  });

  it("says 'no payouts yet' rather than ₹0 when never paid", () => {
    useProviderPayoutSummary.mockReturnValue(
      summary({ last_paid_at: null, last_paid_amount: null }),
    );
    render(<PayoutSummary />);

    expect(screen.getByText(/no payouts yet/i)).toBeInTheDocument();
  });

  it("names no future payout date", () => {
    // Payouts are admin-triggered with no schedule, so any date would be
    // invented — and this is the line a provider would plan around.
    const { container } = render(<PayoutSummary />);

    expect(container.textContent).not.toMatch(/next payout|expected|will be paid on/i);
  });
});

describe("failure", () => {
  it("shows no figure at all", () => {
    // ₹0 here would tell a provider they are owed nothing when the truth is
    // that we could not check.
    useProviderPayoutSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    const { container } = render(<PayoutSummary />);

    expect(container.textContent).not.toMatch(/₹/);
    expect(screen.getByText(/retry/i)).toBeInTheDocument();
  });

  it("shows no figure while loading either", () => {
    useProviderPayoutSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    const { container } = render(<PayoutSummary />);

    expect(container.textContent).not.toMatch(/₹/);
  });
});
