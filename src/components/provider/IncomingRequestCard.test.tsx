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
import { render, screen } from "@testing-library/react";

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
  },
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
