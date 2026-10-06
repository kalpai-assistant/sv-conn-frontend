/**
 * The job screen when the job isn't this provider's any more (403/404): a
 * plain explanation and a way back, not the server's error text in red. Other
 * errors still show as errors.
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

import { Route } from "@/routes/provider/bookings/$bookingId";

const Page = (Route as unknown as { component: () => React.ReactElement }).component;

const failed = (error: unknown) =>
  bookingQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error });

beforeEach(() => vi.clearAllMocks());

describe("a job that's no longer this provider's", () => {
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
      "/provider/bookings",
    );
  });
});

describe("any other failure", () => {
  it("still shows the error", () => {
    failed(new ApiError(500, "API error: 500 Internal Server Error"));
    render(<Page />);

    expect(screen.getByText("API error: 500 Internal Server Error")).toBeInTheDocument();
    expect(screen.queryByText("This job is no longer yours")).toBeNull();
  });
});
