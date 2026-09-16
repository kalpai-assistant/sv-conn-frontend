/**
 * Work in hand, on Provider Home (SVC-274).
 *
 * Home told a provider whether they *could* get jobs and nothing about the ones
 * they already had. Those sat one tab away — but providers do not browse to a
 * job, they are pushed to one, and every pushed session lands on Home.
 *
 * The assertions here are mostly about *ordering and emphasis* rather than
 * presence: a flat list of three would render the same data and still make the
 * provider work out which one is live.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Booking } from "@/lib/mock-data";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/components/provider/JobActions", () => ({
  EnRouteStep: () => <button>I’m on my way</button>,
  DoorstepOtpStep: () => <div>Ask for the 4-digit PIN</div>,
  CompleteStep: () => <button>Mark as Complete</button>,
}));

import { LiveJobs } from "@/components/provider/LiveJobs";

function job(over: Partial<Booking>): Booking {
  return {
    id: "j1",
    status: "ACCEPTED",
    service: { name: "Bathroom deep cleaning" },
    address: { full: "Flat 302, Amogh Residency, Kharadi" },
    providerPayout: 349,
    scheduledAt: "",
    createdAt: "2026-09-16T10:00:00Z",
    statusHistory: [],
    ...over,
  } as unknown as Booking;
}

const ok = { isLoading: false, isError: false };

beforeEach(() => vi.clearAllMocks());

describe("which job leads", () => {
  it("promotes the one furthest along, not the first in the list", () => {
    // The statuses are a pipeline. A provider in progress somewhere is not also
    // on their way elsewhere, so only one job is honestly the current one.
    render(
      <LiveJobs
        {...ok}
        jobs={[
          job({
            id: "a",
            status: "ACCEPTED",
            service: { name: "AC installation" },
          } as Partial<Booking>),
          job({ id: "b", status: "IN_PROGRESS" }),
        ]}
      />,
    );

    // The in-progress job carries the action; the accepted one is queued below.
    expect(screen.getByRole("button", { name: /mark as complete/i })).toBeInTheDocument();
    expect(screen.getByText(/next up/i)).toBeInTheDocument();
  });

  it("offers no queue when there is only one job", () => {
    render(<LiveJobs {...ok} jobs={[job({ status: "IN_PROGRESS" })]} />);

    expect(screen.queryByText(/next up/i)).toBeNull();
  });
});

describe("the next action, on the card", () => {
  it.each([
    ["ACCEPTED", /i’m on my way/i],
    ["IN_PROGRESS", /mark as complete/i],
  ])("gives %s its action inline", (status, label) => {
    render(<LiveJobs {...ok} jobs={[job({ status: status as Booking["status"] })]} />);

    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  it("puts the PIN entry on the card too", () => {
    // The case that matters most: a provider standing at a door, phone in one
    // hand. Reaching it used to cost three taps.
    render(<LiveJobs {...ok} jobs={[job({ status: "EN_ROUTE" })]} />);

    expect(screen.getByText(/ask for the 4-digit pin/i)).toBeInTheDocument();
  });
});

describe("what the card leads with", () => {
  it("shows the address, which is what the provider is looking for", () => {
    render(<LiveJobs {...ok} jobs={[job({ status: "IN_PROGRESS" })]} />);

    expect(screen.getByText(/Flat 302, Amogh Residency, Kharadi/)).toBeInTheDocument();
  });

  it("shows the payout, formatted and quiet", () => {
    render(<LiveJobs {...ok} jobs={[job({ status: "IN_PROGRESS" })]} />);

    expect(screen.getByText("₹349")).toBeInTheDocument();
  });
});

describe("nothing live", () => {
  it("collapses to one row rather than an empty box", () => {
    // So the readiness checklist below stays the most useful thing on an idle
    // screen.
    render(<LiveJobs {...ok} jobs={[]} />);

    expect(screen.getByText(/no jobs right now/i)).toBeInTheDocument();
    expect(screen.getByText(/view past jobs/i)).toBeInTheDocument();
  });

  it("ignores finished jobs when deciding that", () => {
    render(
      <LiveJobs {...ok} jobs={[job({ status: "COMPLETED" }), job({ status: "CANCELLED" })]} />,
    );

    expect(screen.getByText(/no jobs right now/i)).toBeInTheDocument();
  });
});

describe("when the fetch fails", () => {
  it("never claims there is no work", () => {
    // The one wrong answer here: a provider who believes it stops looking.
    render(<LiveJobs jobs={[]} isLoading={false} isError />);

    expect(screen.queryByText(/no jobs right now/i)).toBeNull();
    expect(screen.getByText(/couldn’t load your jobs/i)).toBeInTheDocument();
  });

  it("shows no empty state while still loading", () => {
    render(<LiveJobs jobs={[]} isLoading isError={false} />);

    expect(screen.queryByText(/no jobs right now/i)).toBeNull();
  });
});
