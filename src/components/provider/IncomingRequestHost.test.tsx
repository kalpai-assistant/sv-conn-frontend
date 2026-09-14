/**
 * Ignore is undoable, and the decline is what makes it hard (SVC-295).
 *
 * Reported as "tapping outside Accept rejects the job". Reproduced on hardware:
 * tapping outside does nothing — the scrim has no handler — but Ignore sat
 * immediately left of Accept, one tap, no confirmation, on a countdown screen.
 *
 * What makes the recovery delicate is the backend. `decline_offer` is
 * write-once (it returns early once `response` is set) and `list_open_offers`
 * skips any answered row permanently. Nothing clears the field. So an Undo
 * that fires the decline and then reopens the card would *appear* to work and
 * strand the job: still acceptable by id, gone from the poll forever.
 *
 * Hence these tests are mostly about a call that must NOT happen yet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const declineMutate = vi.fn();
const offers = vi.fn<() => { booking_id: string }[] | undefined>();

/** The reason the last-rendered card would report, driven per test. */
let dismissWith: ((reason: string) => void) | null = null;

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { role: "provider" } }),
}));
vi.mock("@/hooks/useApi", () => ({
  useProviderProfile: () => ({ data: { is_online: true } }),
}));
vi.mock("@/hooks/useBookingOffer", () => ({
  useDeclineOffer: () => ({ mutate: declineMutate }),
  useProviderOffers: () => ({ data: offers() }),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => null,
}));
vi.mock("@/components/provider/IncomingRequestCard", () => ({
  IncomingRequestCard: ({
    bookingId,
    onDismiss,
  }: {
    bookingId: string;
    onDismiss: (reason: string) => void;
  }) => {
    dismissWith = onDismiss;
    return <div data-testid="card">{bookingId}</div>;
  },
}));

import { Toaster } from "@/components/ui/sonner";
import { IncomingRequestHost } from "@/components/provider/IncomingRequestHost";

/** Render the host with a live Toaster, since Undo lives in the toast. */
function renderHost() {
  return render(
    <>
      <IncomingRequestHost />
      <Toaster />
    </>,
  );
}

/** Tap Ignore the way the card does — through the dismiss callback it was given. */
async function ignore() {
  await act(async () => {
    dismissWith?.("ignored");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  dismissWith = null;
  offers.mockReturnValue([{ booking_id: "b1" }]);
  // jsdom implements no Pointer Capture API, and sonner's swipe-to-dismiss
  // calls it on pointerdown — including on the Undo button. Without these the
  // click still works but throws an unhandled TypeError out of the event
  // handler, which vitest reports as a test-file error.
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
  }
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the undo window", () => {
  it("does not record the refusal while it is still undoable", async () => {
    // The whole fix. A decline sent here cannot be taken back: the column is
    // write-once and the poll skips the row forever after.
    renderHost();
    await ignore();

    expect(declineMutate).not.toHaveBeenCalled();
  });

  it("records it once the window closes", async () => {
    renderHost();
    await ignore();

    await act(async () => {
      vi.advanceTimersByTime(7_000);
    });

    expect(declineMutate).toHaveBeenCalledExactlyOnceWith("b1");
  });

  it("closes the card immediately regardless", async () => {
    // Undo is worthless if the card lingers — the provider tapped Ignore and
    // must see it go. Only the *server* write waits.
    renderHost();
    expect(screen.getByTestId("card")).toBeInTheDocument();

    await ignore();

    expect(screen.queryByTestId("card")).toBeNull();
  });
});

describe("undoing", () => {
  it("never sends the decline at all", async () => {
    renderHost();
    await ignore();

    await userEvent.click(await screen.findByRole("button", { name: /undo/i }));
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    // Not "sent then retracted" — never sent. There is no endpoint that could
    // retract it.
    expect(declineMutate).not.toHaveBeenCalled();
  });

  it("brings the card back", async () => {
    renderHost();
    await ignore();
    expect(screen.queryByTestId("card")).toBeNull();

    await userEvent.click(await screen.findByRole("button", { name: /undo/i }));

    expect(await screen.findByTestId("card")).toHaveTextContent("b1");
  });
});

describe("more than one at a time", () => {
  it("keeps a separate window per booking", async () => {
    // The queue drains as fast as the provider dismisses, so two cards can be
    // ignored inside one window. A second mis-tap must not cancel the first
    // one's pending decline — which a single shared timer would do.
    // Two offers queued: ignoring the head surfaces the next one, which is the
    // real sequence — the host takes `find(...)` over the polled list.
    offers.mockReturnValue([{ booking_id: "b1" }, { booking_id: "b2" }]);
    const { rerender } = renderHost();
    await ignore();

    // The second card must actually mount before it can be dismissed;
    // otherwise `dismissWith` is still the unmounted first card's callback.
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    rerender(
      <>
        <IncomingRequestHost />
        <Toaster />
      </>,
    );
    expect(screen.getByTestId("card")).toHaveTextContent("b2");
    await ignore();

    await act(async () => {
      vi.advanceTimersByTime(7_000);
    });

    expect(declineMutate).toHaveBeenCalledWith("b1");
    expect(declineMutate).toHaveBeenCalledWith("b2");
  });
});

describe("leaving with a decline still pending", () => {
  it("flushes rather than dropping it", async () => {
    // Logging out or navigating away mid-window would otherwise lose the
    // refusal entirely, and the offer would return on the next poll as though
    // nothing had been tapped.
    const { unmount } = renderHost();
    await ignore();
    expect(declineMutate).not.toHaveBeenCalled();

    unmount();

    expect(declineMutate).toHaveBeenCalledExactlyOnceWith("b1");
  });
});

describe("every other way a card closes", () => {
  it.each(["accepted", "taken", "expired", "unavailable"])(
    "does not schedule a decline for %s",
    async (reason) => {
      renderHost();
      await act(async () => {
        dismissWith?.(reason);
      });

      await act(async () => {
        vi.advanceTimersByTime(20_000);
      });

      expect(declineMutate).not.toHaveBeenCalled();
    },
  );
});
