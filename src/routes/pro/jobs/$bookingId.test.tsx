/**
 * The Pro's job screen, where a "job_cancelled" or "unassigned" push lands
 * (SVC-348). A cancelled job still answers (the cancel keeps the Pro on it) and
 * must say plainly not to travel; a job taken off them answers 403, and gets an
 * explanation and a way back, not the server's error text in red.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api";

const { bookingQuery } = vi.hoisted(() => ({ bookingQuery: vi.fn() }));

vi.mock("@/hooks/useApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useApi")>();
  return { ...actual, useBooking: () => bookingQuery() };
});
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    useParams: () => ({ bookingId: "b1" }),
  }),
  Link: ({ children, to }: React.PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

// Stubbed: what matters here is which branch renders, not the steps' internals.
vi.mock("@/components/provider/JobAddress", () => ({ JobAddress: () => <div /> }));
vi.mock("@/components/provider/JobActions", () => ({
  EnRouteStep: () => <button type="button">I’m on my way</button>,
  DoorstepOtpStep: () => <div />,
  CompleteStep: () => <div />,
}));

import { Route } from "@/routes/pro/jobs/$bookingId";

const Page = (Route as unknown as { component: () => React.ReactElement }).component;

const job = (status: string) => ({
  id: "b1",
  status,
  service: { name: "Bathroom deep cleaning" },
  totalAmount: 499,
  paymentMethod: "cash",
  address: null,
});

const failed = (error: unknown, data: unknown = undefined) =>
  bookingQuery.mockReturnValue({ data, isLoading: false, isError: true, error });

beforeEach(() => vi.clearAllMocks());

describe("a cancelled job", () => {
  it("says it was cancelled and not to travel, with no steps", () => {
    bookingQuery.mockReturnValue({
      data: job("CANCELLED"),
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<Page />);

    expect(screen.getByText("This job was cancelled")).toBeInTheDocument();
    expect(screen.getByText("Please don’t travel to it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /on my way/i })).toBeNull();
  });
});

describe("a job that's no longer this Pro's", () => {
  it.each([
    [403, "You do not have access to this booking"],
    [404, "Booking b1 not found"],
  ])("explains a %i plainly and links back to the jobs list", (status, message) => {
    failed(new ApiError(status, message));
    render(<Page />);

    expect(screen.getByText("This job is no longer yours")).toBeInTheDocument();
    expect(screen.queryByText(message)).toBeNull();
    expect(screen.getByRole("link", { name: /back to your jobs/i })).toHaveAttribute(
      "href",
      "/pro/jobs",
    );
  });

  it("hides the stale job, steps included, once it's gone", () => {
    // The screen was open when the "unassigned" push refreshed it: React Query
    // keeps the last good data alongside the 403.
    failed(new ApiError(403, "You do not have access to this booking"), job("ACCEPTED"));
    render(<Page />);

    expect(screen.getByText("This job is no longer yours")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /on my way/i })).toBeNull();
    expect(screen.queryByText("Bathroom deep cleaning")).toBeNull();
  });

  it("still shows other errors as errors", () => {
    failed(new ApiError(500, "Internal Server Error"));
    render(<Page />);

    expect(screen.getByText("Internal Server Error")).toBeInTheDocument();
    expect(screen.queryByText("This job is no longer yours")).toBeNull();
  });
});
