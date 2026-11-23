/**
 * The button geometry, which is the bug (SVC-295).
 *
 * Ignore and Accept used to be two equal-width buttons in one row, Ignore
 * immediately left. A thumb aimed at Accept that landed a few millimetres left
 * lost the job — one tap, no confirmation, on a screen with a countdown the
 * provider is hurrying to answer.
 *
 * These assertions are about *arrangement*, not styling taste: they pin the
 * property that made the mis-tap likely, so a later refactor cannot quietly
 * put the two controls back side by side.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const offer = vi.fn();
const acceptMutate = vi.fn();

vi.mock("@/hooks/useBookingOffer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useBookingOffer")>();
  return {
    ...actual,
    useBookingOffer: () => ({ data: offer(), error: null, isLoading: false }),
    useAcceptOffer: () => ({ mutate: acceptMutate, isPending: false }),
  };
});
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
    // SVC-492: countdown pill is a motion.span for the pulse animation.
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...props}>{children}</span>
    ),
  },
  // SVC-492: pulse drops on reduced-motion; palette still escalates.
  useReducedMotion: () => false,
}));

// SVC-492: Warning haptic on first render — module-mocked so the test
// can assert the call site without the native plugin.
const hapticWarning = vi.fn();
vi.mock("@/lib/haptics", () => ({
  hapticWarning: () => hapticWarning(),
  hapticImpactLight: () => undefined,
  hapticImpactMedium: () => undefined,
  hapticSuccess: () => undefined,
}));

// Stubbed: the picker has its own tests. Here what matters is that the card
// shows it instead of closing.
vi.mock("@/components/provider/TeamPicker", () => ({
  TeamPicker: ({ onBack }: { onBack: () => void }) => (
    <button type="button" onClick={onBack}>
      team-picker
    </button>
  ),
}));

import { IncomingRequestCard } from "@/components/provider/IncomingRequestCard";

const OFFER = {
  booking_id: "b1",
  service_name: "Bathroom deep cleaning",
  service_amount: 499,
  full_address: "Flat 7, Karve Nagar, Pune",
  distance_km: 0.4,
  expires_at: "2026-09-14T18:35:37.541591Z",
  seconds_remaining: 104,
};

beforeEach(() => {
  vi.clearAllMocks();
  offer.mockReturnValue(OFFER);
});

function buttons() {
  return {
    accept: screen.getByRole("button", { name: /^accept$/i }),
    ignore: screen.getByRole("button", { name: /^ignore$/i }),
  };
}

describe("where the two controls sit", () => {
  it("does not put them side by side in one row", () => {
    // The failure geometry, asserted directly: sharing a flex row is what put
    // Ignore under a thumb aiming for Accept.
    render(<IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);
    const { accept, ignore } = buttons();

    expect(accept.parentElement).toBe(ignore.parentElement);
    expect(accept.parentElement?.className).toContain("flex-col");
  });

  it("puts Accept first", () => {
    // Accept is what the screen is for; the primary action reads first and
    // sits where the thumb arrives.
    render(<IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);
    const { accept, ignore } = buttons();

    expect(accept.compareDocumentPosition(ignore)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("gives Ignore less visual weight than Accept", () => {
    // Ghost against the default primary — the same pairing this app already
    // uses for a secondary action under a primary one.
    render(<IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);
    const { accept, ignore } = buttons();

    expect(accept.className).toContain("bg-primary");
    expect(ignore.className).not.toContain("bg-primary");
  });
});

describe("what each control still does", () => {
  it("keeps Ignore reachable", () => {
    // De-emphasised, not removed, and still a full-width tap target: harder to
    // hit by accident must not mean harder to hit on purpose.
    render(<IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);

    expect(buttons().ignore).toBeEnabled();
  });

  it("reports an ignore to the host", () => {
    // The card does not know about undo windows or declines — it says what
    // happened and the host decides what that costs.
    const onDismiss = vi.fn();
    render(<IncomingRequestCard bookingId="b1" onDismiss={onDismiss} />);

    buttons().ignore.click();

    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("ignored");
  });

  it("accepts through the mutation, not the dismiss callback", () => {
    const onDismiss = vi.fn();
    render(<IncomingRequestCard bookingId="b1" onDismiss={onDismiss} />);

    buttons().accept.click();

    expect(acceptMutate).toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("a team SP's accept (SVC-321)", () => {
  it("opens the picker in the card instead of closing it", () => {
    acceptMutate.mockImplementationOnce((_id, opts) =>
      opts.onSuccess({ outcome: "pick", pros: [] }),
    );
    const onDismiss = vi.fn();
    render(<IncomingRequestCard bookingId="b1" onDismiss={onDismiss} />);

    act(() => buttons().accept.click());

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "team-picker" })).toBeInTheDocument();
    // Back from the picker is the offer again: nothing was claimed.
    act(() => screen.getByRole("button", { name: "team-picker" }).click());
    expect(buttons().accept).toBeInTheDocument();
  });

  it("still closes the card on a solo SP's claim", () => {
    acceptMutate.mockImplementationOnce((_id, opts) => opts.onSuccess({ outcome: "accepted" }));
    const onDismiss = vi.fn();
    render(<IncomingRequestCard bookingId="b1" onDismiss={onDismiss} />);

    act(() => buttons().accept.click());

    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("accepted");
  });
});

// SVC-492 — Phase 3: through-pocket signal that the offer is on screen.
// The native push already fired on arrival; this fires the *in-app* buzz
// so a user who hadn't looked at the screen yet feels the card is live.
describe("haptic on offer arrival (SVC-492)", () => {
  // Catches: "the Warning haptic never fires — a provider who glances at
  // the push notification but keeps their phone in-pocket misses that the
  // card is now visible and actionable."
  it("fires hapticWarning once when the offer first renders", () => {
    render(<IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);
    expect(hapticWarning).toHaveBeenCalledTimes(1);
  });

  // Catches: "the ref latch regresses to a state flag, strict-mode
  // double-invocation fires the buzz twice on every mount."
  it("does not fire a second time on re-render of the same booking", () => {
    const { rerender } = render(<IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);
    rerender(<IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);
    expect(hapticWarning).toHaveBeenCalledTimes(1);
  });
});

// SVC-492 — the countdown pill escalates as time runs out. These lock
// the three tiers against future "simplify the colours" refactors.
describe("countdown urgency escalation (SVC-492)", () => {
  function timerText() {
    // The pill renders mm:ss. The two helper buttons share no ancestors
    // with the timer, so grabbing the pill via its text is the stable
    // way to verify colour classes.
    return screen.getByText(/^\d:\d\d$/);
  }

  // Catches: "calm-tier palette drops, pill lands in amber from the
  // start — provider reads 'urgent' when they have a full minute."
  it("renders the calm palette when the window is comfortable (> 30s)", () => {
    offer.mockReturnValue({ ...OFFER, seconds_remaining: 60 });
    render(<IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);
    expect(timerText().className).toContain("bg-white/20");
  });

  // Catches: "amber tier never fires — a provider with 20s left sees the
  // same calm chip and doesn't realise they're close."
  it("renders the amber palette when time is tight (≤ 30s)", () => {
    offer.mockReturnValue({ ...OFFER, seconds_remaining: 25 });
    render(<IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);
    expect(timerText().className).toContain("bg-amber-500");
  });

  // Catches: "urgent tier collapses to amber — the final ten-second
  // window loses the pulse + red that was the whole point."
  it("renders the urgent palette when time is nearly up (≤ 10s)", () => {
    offer.mockReturnValue({ ...OFFER, seconds_remaining: 8 });
    render(<IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);
    expect(timerText().className).toContain("bg-destructive");
  });
});

// SVC-492 — the chip. Pre-Phase-3 the card never told the provider
// *why* this offer was theirs; now it always does, with a placeholder
// until SVC-406/SVC-407 ship a real reason.
describe("match-reason chip (SVC-492)", () => {
  // Catches: "chip drops out when `matchReason` is omitted — a caller
  // that doesn't know about the new prop regresses the surface to
  // 'why this job' being empty."
  it("shows the placeholder when no matchReason is passed", () => {
    render(<IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);
    expect(screen.getByText("Nearest match")).toBeInTheDocument();
  });

  // Catches: "custom reason doesn't override the placeholder — when
  // SVC-406 ships real reasons the card still says 'Nearest match'."
  it("shows the custom matchReason when provided", () => {
    render(
      <IncomingRequestCard
        bookingId="b1"
        onDismiss={vi.fn()}
        matchReason="Repeat customer · 4.9 rated"
      />,
    );
    expect(screen.getByText("Repeat customer · 4.9 rated")).toBeInTheDocument();
    expect(screen.queryByText("Nearest match")).not.toBeInTheDocument();
  });
});
