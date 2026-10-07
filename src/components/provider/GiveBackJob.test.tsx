/**
 * Giving back an accepted job (SVC-318 gap). Pinned:
 *
 * - it takes a confirmation: the job goes to other providers and this one is
 *   never offered it again, so a mis-tap must not do it;
 * - it calls the provider cancel route (SVC-344 reopen), with a valid reason;
 * - on the job screen it leaves, since the job is about to stop being theirs;
 * - once en route the backend says no, and the toast says why.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ApiError } from "@/lib/api";

const { cancelMutate, navigate, pathname, toast } = vi.hoisted(() => ({
  cancelMutate: vi.fn(),
  navigate: vi.fn(),
  pathname: { value: "/provider/bookings/b1" },
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/hooks/useApi", () => ({
  useCancelBooking: () => ({ mutate: cancelMutate, isPending: false }),
  useMarkEnRoute: () => ({ mutate: vi.fn(), isPending: false }),
  useStartBooking: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteBooking: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: pathname.value } }),
}));
vi.mock("sonner", () => ({ toast }));

import { EnRouteStep, GIVE_BACK_REASON } from "@/components/provider/JobActions";

beforeEach(() => {
  vi.clearAllMocks();
  pathname.value = "/provider/bookings/b1";
});

function openAndConfirm() {
  fireEvent.click(screen.getByRole("button", { name: /can’t make it/i }));
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /give it back/i }));
}

describe("giving a job back", () => {
  it("sits under the ACCEPTED step, and does nothing until confirmed", () => {
    render(<EnRouteStep bookingId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: /can’t make it/i }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent(/won’t be offered this job again/i);
    expect(cancelMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /keep the job/i }));
    expect(cancelMutate).not.toHaveBeenCalled();
  });

  it("calls the provider cancel with a reason the backend accepts", () => {
    render(<EnRouteStep bookingId="b1" />);
    openAndConfirm();

    expect(cancelMutate).toHaveBeenCalledWith(
      { bookingId: "b1", reason: GIVE_BACK_REASON },
      expect.anything(),
    );
    // CancelBookingRequest.reason: min 5, max 500.
    expect(GIVE_BACK_REASON.length).toBeGreaterThanOrEqual(5);
    expect(GIVE_BACK_REASON.length).toBeLessThanOrEqual(500);
  });

  it("leaves the job screen once it's given back", () => {
    cancelMutate.mockImplementationOnce((_vars, opts) => opts.onSuccess());
    render(<EnRouteStep bookingId="b1" />);
    openAndConfirm();

    expect(toast.success).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ to: "/provider/bookings" });
  });

  it("stays put on Home, where the card just drops out of the list", () => {
    pathname.value = "/provider";
    cancelMutate.mockImplementationOnce((_vars, opts) => opts.onSuccess());
    render(<EnRouteStep bookingId="b1" compact />);
    openAndConfirm();

    expect(navigate).not.toHaveBeenCalled();
  });

  it("explains a refusal once the provider is on the way", () => {
    cancelMutate.mockImplementationOnce((_vars, opts) =>
      opts.onError(new ApiError(409, "x", undefined, "PROVIDER_EN_ROUTE")),
    );
    render(<EnRouteStep bookingId="b1" />);
    openAndConfirm();

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/needs support/));
    expect(navigate).not.toHaveBeenCalled();
  });
});
