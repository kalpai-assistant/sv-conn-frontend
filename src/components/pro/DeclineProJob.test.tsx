/**
 * A team Pro working a job (SVC-322): the shared steps drive the Pro's own
 * endpoints, and the way out is Decline — confirmed, never one tap — not the
 * SP's "give it back".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ApiError } from "@/lib/api";

const { proEnRoute, spEnRoute, proStart, declineMutate, navigate, pathname, toast } = vi.hoisted(
  () => ({
    proEnRoute: vi.fn(),
    spEnRoute: vi.fn(),
    proStart: vi.fn(),
    declineMutate: vi.fn(),
    navigate: vi.fn(),
    pathname: { value: "/pro/jobs/b1" },
    toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  }),
);

vi.mock("@/hooks/useApi", () => ({
  useCancelBooking: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkEnRoute: () => ({ mutate: spEnRoute, isPending: false }),
  useStartBooking: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteBooking: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/usePro", () => ({
  useProEnRoute: () => ({ mutate: proEnRoute, isPending: false }),
  useProStart: () => ({ mutate: proStart, isPending: false }),
  useProComplete: () => ({ mutate: vi.fn(), isPending: false }),
  useDeclineProJob: () => ({ mutate: declineMutate, isPending: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: pathname.value } }),
}));
vi.mock("sonner", () => ({ toast }));

import { DoorstepOtpStep, EnRouteStep } from "@/components/provider/JobActions";
import { declineErrorMessage, declinedMessage } from "@/lib/pro-decline";

beforeEach(() => {
  vi.clearAllMocks();
  pathname.value = "/pro/jobs/b1";
});

describe("the Pro's steps", () => {
  it("'I'm on my way' calls the Pro's endpoint, not the SP's", () => {
    render(<EnRouteStep bookingId="b1" actor="pro" />);
    fireEvent.click(screen.getByRole("button", { name: /on my way/i }));
    expect(proEnRoute).toHaveBeenCalledWith({ bookingId: "b1" }, expect.anything());
    expect(spEnRoute).not.toHaveBeenCalled();
  });

  it("the doorstep PIN goes through the Pro's start", () => {
    render(<DoorstepOtpStep bookingId="b1" actor="pro" />);
    // Typing the fourth digit submits.
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1234" } });
    expect(proStart).toHaveBeenCalledWith({ bookingId: "b1", otp: "1234" }, expect.anything());
  });

  it("offers Decline, not the SP's give-back, under 'I'm on my way'", () => {
    render(<EnRouteStep bookingId="b1" actor="pro" />);
    expect(screen.getByRole("button", { name: /can’t do this job/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /can’t make it/i })).not.toBeInTheDocument();
  });

  it("leaves the SP's step as it was", () => {
    render(<EnRouteStep bookingId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: /on my way/i }));
    expect(spEnRoute).toHaveBeenCalled();
    expect(proEnRoute).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /can’t make it/i })).toBeInTheDocument();
  });
});

describe("declining", () => {
  function openAndConfirm() {
    fireEvent.click(screen.getByRole("button", { name: /can’t do this job/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^decline$/i }));
  }

  it("does nothing until confirmed", () => {
    render(<EnRouteStep bookingId="b1" actor="pro" />);
    fireEvent.click(screen.getByRole("button", { name: /can’t do this job/i }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/can’t take it back/i);
    fireEvent.click(screen.getByRole("button", { name: /keep the job/i }));
    expect(declineMutate).not.toHaveBeenCalled();
  });

  it("declines, says where the job went, and leaves the job screen", () => {
    declineMutate.mockImplementation((_id, { onSuccess }) =>
      onSuccess({ booking_id: "b1", outcome: "awaiting_repick" }),
    );
    render(<EnRouteStep bookingId="b1" actor="pro" />);
    openAndConfirm();

    expect(declineMutate).toHaveBeenCalledWith("b1", expect.anything());
    expect(toast.success).toHaveBeenCalledWith("Job declined. Your team will pick someone else.");
    expect(navigate).toHaveBeenCalledWith({ to: "/pro/jobs" });
  });

  it("stays put on Pro Home, where the card just drops out", () => {
    pathname.value = "/pro";
    declineMutate.mockImplementation((_id, { onSuccess }) =>
      onSuccess({ booking_id: "b1", outcome: "reopened" }),
    );
    render(<EnRouteStep bookingId="b1" actor="pro" />);
    openAndConfirm();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("explains a refusal once the Pro is on the way", () => {
    declineMutate.mockImplementation((_id, { onError }) => onError(new ApiError(409, "late")));
    render(<EnRouteStep bookingId="b1" actor="pro" />);
    openAndConfirm();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/already on your way/i));
  });
});

describe("decline copy", () => {
  it("names where the job went", () => {
    expect(declinedMessage("awaiting_repick")).toMatch(/your team will pick/i);
    expect(declinedMessage("reopened")).toMatch(/find the customer someone else/i);
  });

  it("explains each refusal", () => {
    expect(declineErrorMessage(new ApiError(409, "x"))).toMatch(/already on your way/i);
    expect(declineErrorMessage(new ApiError(404, "x"))).toBe("This job is no longer yours.");
    expect(declineErrorMessage(new TypeError("Failed to fetch"))).toBe("Failed to fetch");
  });
});
