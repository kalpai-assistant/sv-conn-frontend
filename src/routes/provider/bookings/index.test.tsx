/**
 * The provider's job history (SVC-296).
 *
 * Before this, finishing a job made it disappear: the screen kept only
 * ACCEPTED / EN_ROUTE / IN_PROGRESS, so a provider had no record of work they
 * had actually done. Reproduced on the live beta account — two bookings on the
 * server, both cancelled, and the screen read "No jobs right now".
 *
 * The other half of the ticket is money. These rows used to show the customer's
 * price on a provider's own screen, which is the app being wrong about their
 * earnings, so the amount is asserted here as carefully as the filtering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The row's date comes from `endedAt`, which uses toLocaleDateString(undefined,
// ...) — so the short-month spelling varies by host locale/ICU set. Build the
// expected string with the same options to track the formatter rather than a
// specific spelling.
function formattedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const bookings = vi.fn();
const totals = vi.fn(() => ({ total: 0, truncated: false }));

vi.mock("@/hooks/useApi", () => ({
  useBookings: () => ({ data: bookings(), isLoading: false, isError: false, error: null }),
  useBookingsTotal: () => totals(),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { name: "Tush" } }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: unknown }) => opts,
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/components/AccountAvatar", () => ({ AccountAvatar: () => <div /> }));

import { Route } from "@/routes/provider/bookings/index";

const Page = (Route as unknown as { component: () => React.ReactElement }).component;

function job(over: Record<string, unknown> = {}) {
  return {
    id: "j1",
    status: "ACCEPTED",
    service: { name: "Bathroom deep cleaning" },
    address: { full: "Flat 7, Karve Nagar, Pune" },
    providerPayout: 349,
    totalAmount: 499,
    createdAt: "2026-09-14T18:26:18Z",
    scheduledAt: "2026-09-14T18:26:18Z",
    statusHistory: [],
    ...over,
  };
}

const DONE = job({
  id: "j2",
  status: "COMPLETED",
  providerPayout: 700,
  statusHistory: [
    { status: "ACCEPTED", at: "2026-09-10T09:00:00Z" },
    { status: "COMPLETED", at: "2026-09-12T14:30:00Z" },
  ],
});

const ORIGINAL_TZ = process.env.TZ;
beforeEach(() => {
  vi.clearAllMocks();
  totals.mockReturnValue({ total: 0, truncated: false });
  bookings.mockReturnValue([job(), DONE]);
  // Pin TZ so timestamps near a day boundary don't shift the rendered date.
  process.env.TZ = "Asia/Kolkata";
});
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
  vi.useRealTimers();
});

async function openPast() {
  await userEvent.click(screen.getByRole("button", { name: /^past$/i }));
}

describe("splitting active from finished", () => {
  it("shows only jobs still in flight by default", () => {
    // A provider opening the app is working, not reviewing.
    render(<Page />);

    expect(screen.getByText("Bathroom deep cleaning")).toBeInTheDocument();
    // Anchored: the tab's own description says "accepted" too, and a loose
    // match would pass on the prose rather than on a status chip.
    expect(screen.getByText(/^accepted$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^completed$/i)).toBeNull();
  });

  it("shows finished work under Past", async () => {
    // The bug: this job existed on the server and appeared nowhere in the app.
    render(<Page />);
    await openPast();

    expect(screen.getByText(/^completed$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^accepted$/i)).toBeNull();
  });

  it.each([
    ["CANCELLED", /^cancelled$/i],
    ["EXPIRED", /^expired$/i],
  ])("files %s under Past too", async (status, label) => {
    // Past is the complement of "in flight", not a list of three — so a status
    // added later surfaces here rather than vanishing from both tabs.
    bookings.mockReturnValue([job({ status })]);
    render(<Page />);
    await openPast();

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("the amount on a row", () => {
  it("shows what the provider earns, not what the customer paid", () => {
    // ₹349 payout on a ₹499 job. Showing 499 here is the app being wrong about
    // the provider's own money.
    render(<Page />);

    expect(screen.getByText(/You earn ₹349/)).toBeInTheDocument();
    expect(screen.queryByText(/499/)).toBeNull();
  });

  it("uses payout on finished jobs too", async () => {
    // Split across the tabs, the figure would appear to drop the moment a job
    // finished — as though the platform took a cut at the end.
    render(<Page />);
    await openPast();

    expect(screen.getByText(/You earn ₹700/)).toBeInTheDocument();
  });
});

describe("when a job ended", () => {
  it("dates a past job by its terminal transition", async () => {
    // Not the booking date: a job cancelled days after it was booked belongs
    // under the day it ended, which is what someone looking back searches for.
    render(<Page />);
    await openPast();

    expect(screen.getByText(formattedDate("2026-09-12T14:30:00Z"))).toBeInTheDocument();
  });

  it("falls back to the booking date when history is empty", async () => {
    // Bookings predating SVC-248 carry no history; an empty cell would read as
    // a bug rather than as missing data.
    bookings.mockReturnValue([job({ status: "COMPLETED", statusHistory: [] })]);
    render(<Page />);
    await openPast();

    expect(screen.getByText(formattedDate("2026-09-14T18:26:18Z"))).toBeInTheDocument();
  });
});

describe("which tab is selected", () => {
  it("fills the selected tab with the brand colour, not just a shadow", async () => {
    // The previous treatment separated selected from unselected by a shadow
    // alone, which on a phone in daylight is close to no signal at all.
    render(<Page />);
    const active = screen.getByRole("button", { name: /^active$/i });
    const past = screen.getByRole("button", { name: /^past$/i });

    expect(active.className).toContain("bg-primary");
    expect(past.className).not.toContain("bg-primary");

    await openPast();

    expect(screen.getByRole("button", { name: /^past$/i }).className).toContain("bg-primary");
    expect(screen.getByRole("button", { name: /^active$/i }).className).not.toContain("bg-primary");
  });

  it("says which tab is selected for assistive tech too", () => {
    // Colour is the only other cue, so it cannot be the only cue.
    render(<Page />);

    expect(screen.getByRole("button", { name: /^active$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^past$/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("empty states", () => {
  it("says something different for each tab", async () => {
    bookings.mockReturnValue([]);
    render(<Page />);
    expect(screen.getByText(/no jobs right now/i)).toBeInTheDocument();

    await openPast();
    expect(screen.getByText(/no past jobs yet/i)).toBeInTheDocument();
  });
});

describe("more rows than one response carries", () => {
  it("admits the list is truncated", () => {
    // Silence here would let a provider believe older work no longer exists —
    // the very complaint this ticket is about.
    totals.mockReturnValue({ total: 80, truncated: true });
    render(<Page />);

    expect(screen.getByText(/50 most recent jobs of 80/i)).toBeInTheDocument();
  });

  it("stays quiet when everything fits", () => {
    render(<Page />);

    expect(screen.queryByText(/most recent jobs/i)).toBeNull();
  });
});
