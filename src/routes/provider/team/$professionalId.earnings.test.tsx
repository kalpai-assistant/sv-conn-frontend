/**
 * One Pro's earnings (SVC-323). The name, photo and lifetime figure come from
 * the by-pro `all` list, which includes removed Pros; the window comes from
 * `/me/earnings?professional_id=`. A Pro who isn't the SP's shows no figures.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ApiError } from "@/lib/api";

const params = { professionalId: "p-ravi" };
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: object) => ({ ...opts, useParams: () => params }),
  Link: ({ children, to }: React.PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn(), length: 1 }, navigate: vi.fn() }),
}));
vi.mock("@/components/provider/WeekEarningsChart", () => ({
  WeekEarningsChart: () => <div data-testid="week-chart" />,
}));
vi.mock("@/components/provider/MonthEarningsChart", () => ({
  MonthEarningsChart: () => <div data-testid="month-chart" />,
}));

const useEarningsByPro = vi.fn();
const useProEarnings = vi.fn();
vi.mock("@/hooks/useProEarnings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useProEarnings")>()),
  useEarningsByPro: (range: string) => useEarningsByPro(range),
  useProEarnings: (range: string, id: string) => useProEarnings(range, id),
}));

import { Route } from "@/routes/provider/team/$professionalId.earnings";

const Page = (Route as unknown as { component: () => React.ReactElement }).component;

const pro = (id: string | null, over: Record<string, unknown> = {}) => ({
  professional_id: id,
  display_name: id ?? "Not assigned",
  profile_photo_url: null,
  is_self: false,
  is_active: true,
  payout: 0,
  completed_count: 0,
  ...over,
});
const lifetime = (pros: ReturnType<typeof pro>[]) => ({
  data: { range: "all", total_payout: 0, completed_count: 0, pros },
  isLoading: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
});
const windowOf = (total_payout: number, bookings: unknown[] = []) => ({
  data: { range: "week", total_payout, completed_count: bookings.length, bookings },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
});
const job = {
  booking_id: "b1",
  service_name: "AC service",
  completed_at: "2026-10-06T11:00:00Z",
  payout_amount: 650,
  tip_amount: 0,
  professional: { id: "p-ravi", display_name: "Ravi", is_self: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  params.professionalId = "p-ravi";
  useEarningsByPro.mockReturnValue(
    lifetime([
      pro("p-self", { display_name: "Tush", is_self: true }),
      pro("p-ravi", { display_name: "Ravi", payout: 4200, completed_count: 7 }),
    ]),
  );
  useProEarnings.mockReturnValue(windowOf(650, [job]));
});

describe("a Pro's earnings", () => {
  it("leads with their all-time total, from the by-pro list", () => {
    render(<Page />);
    expect(useEarningsByPro).toHaveBeenCalledWith("all");
    expect(screen.getByRole("heading", { name: "Ravi" })).toBeInTheDocument();
    expect(screen.getByText("₹4,200")).toBeInTheDocument();
    expect(screen.getByText(/7 jobs completed/i)).toBeInTheDocument();
  });

  it("shows their window and jobs, without a 'by' line every row would repeat", () => {
    render(<Page />);
    expect(useProEarnings).toHaveBeenCalledWith("week", "p-ravi");
    expect(screen.getByText("AC service")).toBeInTheDocument();
    expect(screen.getByTestId("week-chart")).toBeInTheDocument();
    expect(screen.queryByText(/by ravi/i)).not.toBeInTheDocument();
  });

  it("switches the window for the same Pro", () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("tab", { name: "This month" }));
    expect(useProEarnings).toHaveBeenLastCalledWith("month", "p-ravi");
    expect(screen.getByTestId("month-chart")).toBeInTheDocument();
  });

  it("offers no all-time tab: the hero already is all time", () => {
    render(<Page />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Today",
      "This week",
      "This month",
    ]);
  });

  it("titles the SP's own row 'You'", () => {
    params.professionalId = "p-self";
    render(<Page />);
    expect(screen.getByRole("heading", { name: "You" })).toBeInTheDocument();
  });

  it("marks a removed Pro, and still shows their history", () => {
    useEarningsByPro.mockReturnValue(
      lifetime([
        pro("p-ravi", { display_name: "Ravi", is_active: false, payout: 900, completed_count: 2 }),
      ]),
    );
    render(<Page />);
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText("₹900")).toBeInTheDocument();
  });

  it("says 'No jobs yet' for a Pro with none, not ₹0", () => {
    useEarningsByPro.mockReturnValue(lifetime([pro("p-ravi", { display_name: "Ravi" })]));
    render(<Page />);
    expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument();
  });
});

describe("not on the SP's team", () => {
  it("shows no figures on a 404 PRO_NOT_FOUND", () => {
    useProEarnings.mockReturnValue({
      ...windowOf(0),
      data: undefined,
      isError: true,
      error: new ApiError(404, "Not found", undefined, "PRO_NOT_FOUND"),
    });
    const { container } = render(<Page />);
    expect(screen.getByText(/not on your team/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/₹/);
  });

  it("shows no figures when the id isn't in the SP's by-pro list", () => {
    params.professionalId = "someone-else";
    const { container } = render(<Page />);
    expect(screen.getByText(/not on your team/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/₹/);
  });
});
