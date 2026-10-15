/**
 * Pick-a-Pro (SVC-321). What's pinned:
 *
 * - availability: busy and offline rows can't be picked; the SP's own row can
 *   be, whatever the team fetch says, since their own toggle covers it;
 * - a failed team fetch must not lock every non-self row (the extra request is
 *   a hint; /assign's PRO_OFFLINE is the gate);
 * - a Pro-level refusal keeps the picker open, a booking-level one closes it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api";

const { navigate, toast, teamQuery, assignMutate } = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  teamQuery: vi.fn(),
  assignMutate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/hooks/useTeam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTeam")>();
  return {
    ...actual,
    useTeam: () => teamQuery(),
    useAssignPro: () => ({ mutate: assignMutate, isPending: false }),
  };
});

import { TeamPicker } from "@/components/provider/TeamPicker";

const pro = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  display_name: id,
  profile_photo_url: null,
  is_self: false,
  busy: false,
  accepts_direct_jobs: true,
  ...over,
});
const member = (id: string, is_online: boolean, kyc_status = "verified") => ({
  id,
  is_online,
  kyc_status,
});

const PROS = [
  pro("Me", { is_self: true }),
  pro("Asha"),
  pro("Ravi", { busy: true }),
  pro("Mahesh"),
];

const onDismiss = vi.fn();
const onBack = vi.fn();

function renderPicker(pros = PROS) {
  render(
    <TeamPicker bookingId="b1" pros={pros} expired={false} onBack={onBack} onDismiss={onDismiss} />,
  );
}

const row = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

function pickAndAssign(name: string) {
  fireEvent.click(row(name));
  fireEvent.click(screen.getByRole("button", { name: /^(assign to|do it myself)/i }));
}

/** Make the next assign fail with this error. */
function assignFails(error: unknown) {
  assignMutate.mockImplementationOnce((_vars, opts) => opts.onError(error));
}

beforeEach(() => {
  vi.clearAllMocks();
  teamQuery.mockReturnValue({
    data: [
      member("Me", false),
      member("Asha", true),
      member("Ravi", true),
      member("Mahesh", false),
    ],
  });
});

describe("availability", () => {
  it("disables busy and offline Pros, never the SP's own row", () => {
    renderPicker();
    // The SP's own row reads the SP's toggle, not the Pro row: always pickable.
    expect(row("Me")).toBeEnabled();
    expect(row("Asha")).toBeEnabled();
    expect(row("Ravi")).toBeDisabled();
    expect(row("Mahesh")).toBeDisabled();
    expect(row("Ravi")).toHaveTextContent("On a job");
    expect(row("Mahesh")).toHaveTextContent("Offline");
  });

  it("leaves rows pickable when the team fetch fails", () => {
    teamQuery.mockReturnValue({ data: undefined, isError: true });
    renderPicker();
    expect(row("Asha")).toBeEnabled();
    expect(row("Mahesh")).toBeEnabled();
    // Busy comes from the 202 itself, so it still applies.
    expect(row("Ravi")).toBeDisabled();
  });

  it("needs a pick before Assign is enabled", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: /pick someone/i })).toBeDisabled();
    fireEvent.click(row("Asha"));
    expect(screen.getByRole("button", { name: /assign to asha/i })).toBeEnabled();
  });
});

describe("assigning", () => {
  it("claims, closes the card and opens the job", () => {
    assignMutate.mockImplementationOnce((_vars, opts) => opts.onSuccess());
    renderPicker();
    pickAndAssign("Asha");
    expect(assignMutate.mock.calls[0][0]).toEqual({ bookingId: "b1", professionalId: "Asha" });
    expect(onDismiss).toHaveBeenCalledWith("accepted");
    expect(navigate).toHaveBeenCalledWith({
      to: "/provider/bookings/$bookingId",
      params: { bookingId: "b1" },
    });
  });

  it("keeps the picker open on PRO_BUSY and marks that Pro busy", () => {
    assignFails(new ApiError(409, "x", undefined, "PRO_BUSY"));
    renderPicker();
    pickAndAssign("Asha");
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/another job/));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(row("Asha")).toBeDisabled();
  });

  it("drops a Pro removed from the team while the picker was open", () => {
    assignFails(new ApiError(404, "x", undefined, "PRO_NOT_FOUND"));
    renderPicker();
    pickAndAssign("Asha");
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Asha/ })).toBeNull();
  });

  it("drops a Pro who already declined this booking, picker still open (SVC-361)", () => {
    assignFails(new ApiError(409, "x", undefined, "PRO_DECLINED_THIS_BOOKING"));
    renderPicker();
    pickAndAssign("Asha");
    expect(toast.error).toHaveBeenCalledWith("This Pro already declined this booking.");
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Asha/ })).toBeNull();
    expect(row("Me")).toBeEnabled();
  });

  it.each([
    [new ApiError(410, "gone"), "taken"],
    [new ApiError(404, "Booking not found"), "unavailable"],
    [new ApiError(409, "can't be reassigned"), "unavailable"],
  ])("closes the card when the booking itself is gone (%s)", (error, reason) => {
    assignFails(error);
    renderPicker();
    pickAndAssign("Asha");
    expect(onDismiss).toHaveBeenCalledWith(reason);
  });

  it("stays open with an error on a 5xx", () => {
    assignFails(new ApiError(500, "API error: 500"));
    renderPicker();
    pickAndAssign("Asha");
    expect(toast.error).toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

it("Back returns to the offer without assigning", () => {
  renderPicker();
  fireEvent.click(screen.getByRole("button", { name: /back/i }));
  expect(onBack).toHaveBeenCalled();
  expect(assignMutate).not.toHaveBeenCalled();
});

describe("KYC (backend #196)", () => {
  it("disables a team Pro whose KYC isn't verified, even when online", () => {
    teamQuery.mockReturnValue({
      data: [member("Me", false, "pending"), member("Asha", true, "submitted")],
    });
    renderPicker();
    expect(row("Asha")).toBeDisabled();
    expect(row("Asha")).toHaveTextContent("KYC pending");
    // The SP's own row follows the SP's KYC, which made them eligible.
    expect(row("Me")).toBeEnabled();
  });

  it("keeps the picker open and marks the Pro on PRO_KYC_INCOMPLETE", () => {
    // The team fetch failed, so the row was pickable: /assign is the gate.
    teamQuery.mockReturnValue({ data: undefined, isError: true });
    assignFails(new ApiError(409, "x", undefined, "PRO_KYC_INCOMPLETE"));
    renderPicker();
    pickAndAssign("Asha");
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/KYC/));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(row("Asha")).toBeDisabled();
    expect(row("Asha")).toHaveTextContent("KYC pending");
  });
});

describe("re-pick mode (SVC-324)", () => {
  it("changes who goes without leaving the job screen", () => {
    assignMutate.mockImplementationOnce((_vars, opts) => opts.onSuccess());
    render(
      <TeamPicker
        mode="repick"
        bookingId="b1"
        pros={PROS}
        expired={false}
        onBack={onBack}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/the job stays yours/i)).toBeInTheDocument();
    pickAndAssign("Asha");

    expect(toast.success).toHaveBeenCalledWith("Asha is doing this job");
    expect(onDismiss).toHaveBeenCalledWith("accepted");
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("an SP who doesn't take jobs themselves (SVC-326)", () => {
  it("disables their own row from the list's flag, and says why", () => {
    renderPicker([pro("Me", { is_self: true, accepts_direct_jobs: false }), pro("Asha")]);
    expect(row("Me")).toBeDisabled();
    expect(row("Me")).toHaveTextContent("You're not taking jobs yourself");
    expect(row("Asha")).toBeEnabled();
  });

  it("marks their own row on SELF_NOT_TAKING_JOBS from a stale list, picker still open", () => {
    assignFails(new ApiError(409, "x", undefined, "SELF_NOT_TAKING_JOBS"));
    renderPicker();
    pickAndAssign("Me");
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/not taking jobs yourself/));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(row("Me")).toBeDisabled();
    expect(row("Me")).toHaveTextContent("You're not taking jobs yourself");
    expect(row("Asha")).toBeEnabled();
  });
});
