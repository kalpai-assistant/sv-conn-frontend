/**
 * The Earnings tab (SVC-260).
 *
 * What is worth pinning here is the *separation between the two blocks*. The
 * lifetime hero and the windowed figure come from two different requests, and
 * the natural way to write this screen — one `isLoading`, one `isError`, one
 * early return — makes a failed window blank out a lifetime total that loaded
 * perfectly well, and vice versa. Each block owns its own four states, and these
 * tests fail if someone collapses them.
 *
 * The other invariant: a zero window and a failed window must not look alike.
 * "₹0 and an empty list" is a true statement about a quiet Monday and a false
 * one about a timeout, so the empty state carries copy and the error state
 * carries no figure.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/components/AccountAvatar", () => ({ AccountAvatar: () => <div /> }));
// Stubbed: recharts needs a measured container, and what matters at this level
// is which range the chart appears on, not how it draws.
vi.mock("@/components/provider/WeekEarningsChart", () => ({
  WeekEarningsChart: () => <div data-testid="week-chart" />,
}));
vi.mock("@/components/provider/MonthEarningsChart", () => ({
  MonthEarningsChart: () => <div data-testid="month-chart" />,
}));
// Stubbed: the payout block has its own test file, and leaving it live would
// make every assertion here depend on a second query's state.
vi.mock("@/components/provider/PayoutSummary", () => ({
  PayoutSummary: () => <div data-testid="payout-summary" />,
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { name: "Ravi" } }) }));

const useEarningsSummary = vi.fn();
const useEarnings = vi.fn();
vi.mock("@/hooks/useApi", () => ({
  useEarningsSummary: () => useEarningsSummary(),
  useEarnings: (range: string) => useEarnings(range),
}));

import { Route } from "@/routes/provider/earnings";

const Page = (Route as unknown as { component: () => React.ReactElement }).component;

const job = (over: Record<string, unknown> = {}) => ({
  booking_id: "b1",
  service_name: "Bathroom deep cleaning",
  completed_at: "2026-09-14T11:00:00Z",
  payout_amount: 349,
  tip_amount: 0,
  ...over,
});

const summaryLoaded = (lifetime_payout: number, completed_count: number) => ({
  data: { lifetime_payout, completed_count },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

const windowLoaded = (total_payout: number, bookings: ReturnType<typeof job>[]) => ({
  data: { range: "week", total_payout, completed_count: bookings.length, bookings },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

const failed = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  useEarningsSummary.mockReturnValue(summaryLoaded(48250, 137));
  useEarnings.mockReturnValue(windowLoaded(3480, [job()]));
});

describe("the lifetime hero", () => {
  it("leads with the total and the job count behind it", () => {
    render(<Page />);

    expect(screen.getByText("₹48,250")).toBeInTheDocument();
    expect(screen.getByText(/137 jobs completed/i)).toBeInTheDocument();
    expect(screen.getByText(/all time/i)).toBeInTheDocument();
  });

  it("says 'job', singular, for a provider with one", () => {
    useEarningsSummary.mockReturnValue(summaryLoaded(349, 1));
    render(<Page />);

    expect(screen.getByText(/1 job completed/i)).toBeInTheDocument();
    expect(screen.queryByText(/1 jobs/i)).not.toBeInTheDocument();
  });

  it("labels the window figure, so it does not read as a rival headline", () => {
    render(<Page />);

    // Both figures carry a label. An unlabelled ₹3,480 beside a labelled
    // ₹48,250 invites a comparison between a week and a lifetime.
    expect(screen.getByText("Total earned")).toBeInTheDocument();
    expect(screen.getByText("THIS WEEK")).toBeInTheDocument();
  });
});

describe("the two blocks fail independently", () => {
  it("keeps the lifetime total when the window request fails", () => {
    useEarnings.mockReturnValue(failed);
    render(<Page />);

    expect(screen.getByText("₹48,250")).toBeInTheDocument();
    expect(screen.getByText(/couldn’t load\.?$/i)).toBeInTheDocument();
  });

  it("keeps the window figure when the lifetime request fails", () => {
    useEarningsSummary.mockReturnValue(failed);
    render(<Page />);

    expect(screen.getByText("₹3,480")).toBeInTheDocument();
    expect(screen.getByText(/couldn’t load your total/i)).toBeInTheDocument();
  });

  it("shows no lifetime figure when that request fails", () => {
    // Not ₹0 — that would tell a provider they have earned nothing.
    useEarningsSummary.mockReturnValue(failed);
    const { container } = render(<Page />);

    expect(container.textContent).not.toMatch(/₹48,250/);
  });

  it("retries just the block that failed", () => {
    const refetch = vi.fn();
    useEarningsSummary.mockReturnValue({ ...failed, refetch });
    render(<Page />);

    fireEvent.click(screen.getByText(/retry/i).closest("button")!);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("zero versus failure", () => {
  it("explains an empty window rather than leaving a bare ₹0", () => {
    // ₹0 above an empty box with nothing said reads as a broken fetch.
    useEarnings.mockReturnValue(windowLoaded(0, []));
    render(<Page />);

    expect(screen.getByText("₹0")).toBeInTheDocument();
    expect(screen.getByText(/nothing yet this week/i)).toBeInTheDocument();
  });

  it("renders no job list at all when the window failed", () => {
    // The empty state must not stand in for an error: it would claim the
    // provider did no work in a week they may well have worked.
    useEarnings.mockReturnValue(failed);
    render(<Page />);

    expect(screen.queryByText(/nothing yet/i)).not.toBeInTheDocument();
  });
});

describe("the job list", () => {
  it("names each job and what it paid", () => {
    render(<Page />);

    expect(screen.getByText("Bathroom deep cleaning")).toBeInTheDocument();
    expect(screen.getByText("₹349")).toBeInTheDocument();
  });

  it("breaks out a tip as part of the payout, not on top of it", () => {
    // payout_amount already includes tip_amount — the backend sums them — so
    // the tip line annotates the figure rather than adding to it.
    // Window total deliberately unequal to the row, so "₹399" identifies the
    // row and not the figure above it.
    useEarnings.mockReturnValue(windowLoaded(1200, [job({ payout_amount: 399, tip_amount: 50 })]));
    render(<Page />);

    expect(screen.getByText("₹399")).toBeInTheDocument();
    expect(screen.getByText(/incl\. ₹50 tip/i)).toBeInTheDocument();
  });
});

describe("the window picker", () => {
  it("opens on this week", () => {
    render(<Page />);

    expect(useEarnings).toHaveBeenCalledWith("week");
    expect(screen.getByRole("tab", { name: "This week" })).toHaveAttribute("aria-selected", "true");
  });

  it("refetches for the range the provider picked", () => {
    render(<Page />);

    fireEvent.click(screen.getByRole("tab", { name: "Today" }));
    expect(useEarnings).toHaveBeenCalledWith("today");
  });

  it("changes the window's label with it, since the periods are calendar-bounded", () => {
    render(<Page />);

    fireEvent.click(screen.getByRole("tab", { name: "This month" }));
    expect(screen.getByText("THIS MONTH")).toBeInTheDocument();
  });
});

describe("the week chart", () => {
  it("appears on the week range", () => {
    render(<Page />);

    expect(screen.getByTestId("week-chart")).toBeInTheDocument();
  });

  it("is absent on today — one day is one bar", () => {
    render(<Page />);

    fireEvent.click(screen.getByRole("tab", { name: "Today" }));
    expect(screen.queryByTestId("week-chart")).not.toBeInTheDocument();
  });

  it("hands over to the month chart on the month range", () => {
    // Two components, not one: 31 unlabelled bars need a tap to name a day,
    // which would be clutter on a week whose axis already reads M T W T F S S.
    render(<Page />);

    fireEvent.click(screen.getByRole("tab", { name: "This month" }));
    expect(screen.queryByTestId("week-chart")).not.toBeInTheDocument();
    expect(screen.getByTestId("month-chart")).toBeInTheDocument();
  });

  it("shows no chart at all on today", () => {
    render(<Page />);

    fireEvent.click(screen.getByRole("tab", { name: "Today" }));
    expect(screen.queryByTestId("week-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("month-chart")).not.toBeInTheDocument();
  });

  it("is absent while the window is loading", () => {
    useEarnings.mockReturnValue({ ...failed, isLoading: true, isError: false });
    render(<Page />);

    expect(screen.queryByTestId("week-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("month-chart")).not.toBeInTheDocument();
  });

  it("is absent when the window request failed", () => {
    // A chart drawn from no data would read as a genuinely empty window.
    useEarnings.mockReturnValue(failed);
    render(<Page />);

    expect(screen.queryByTestId("week-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("month-chart")).not.toBeInTheDocument();
  });
});
