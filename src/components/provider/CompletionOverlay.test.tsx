/**
 * SVC-493 — CompletionOverlay failure modes this test file locks:
 *
 *   1. hapticSuccess fires on every re-render — the route polls every
 *      4s via useBooking, and a strong iOS triple-buzz on each re-render
 *      would turn the completed screen into a buzz loop. The ref guard
 *      must keep it to one fire per booking id per mount.
 *
 *   2. `providerPayout == null` on an older booking row crashes the
 *      overlay with "Cannot read ..." — the null-safe branch must
 *      render an em-dash instead and not throw.
 *
 *   3. onDismissed is never called — the Celebration's 1.5s auto-
 *      dismiss contract must be reachable so the host screen swaps
 *      the overlay for the EarningsBreakdown body.
 *
 *   4. The custom title / subtitle wiring regresses to the SVC-390
 *      default "Booking confirmed!" copy, which would lie to the
 *      provider at job completion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const hapticSuccess = vi.fn();
vi.mock("@/lib/haptics", () => ({
  hapticSuccess: () => hapticSuccess(),
  hapticImpactLight: () => undefined,
  hapticImpactMedium: () => undefined,
  hapticWarning: () => undefined,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
    h1: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <h1 {...props}>{children}</h1>
    ),
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...props}>{children}</span>
    ),
  },
  useReducedMotion: () => true, // skip the rAF tween in tests — deterministic
}));

import { CompletionOverlay } from "@/components/provider/CompletionOverlay";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CompletionOverlay", () => {
  it("fires hapticSuccess exactly once per booking id (not per re-render)", () => {
    const onDismissed = vi.fn();
    const { rerender } = render(
      <CompletionOverlay bookingId="b1" payoutAmount={500} onDismissed={onDismissed} />,
    );
    // Three re-renders simulate the useBooking 4s poll cadence; the
    // ref guard must keep the haptic to one fire.
    rerender(<CompletionOverlay bookingId="b1" payoutAmount={500} onDismissed={onDismissed} />);
    rerender(<CompletionOverlay bookingId="b1" payoutAmount={500} onDismissed={onDismissed} />);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
  });

  it("fires hapticSuccess again when the booking id changes (new job completed)", () => {
    const onDismissed = vi.fn();
    const { rerender } = render(
      <CompletionOverlay bookingId="b1" payoutAmount={500} onDismissed={onDismissed} />,
    );
    rerender(<CompletionOverlay bookingId="b2" payoutAmount={700} onDismissed={onDismissed} />);
    expect(hapticSuccess).toHaveBeenCalledTimes(2);
  });

  it("renders em-dash when payoutAmount is null so an older booking doesn't crash", () => {
    const onDismissed = vi.fn();
    expect(() =>
      render(<CompletionOverlay bookingId="b1" payoutAmount={null} onDismissed={onDismissed} />),
    ).not.toThrow();
    // Honest unknown-earnings rendering: an em-dash somewhere in the subtitle.
    // There are two matches — the visible subtitle + the aria-live clone.
    expect(screen.getAllByText(/—/).length).toBeGreaterThanOrEqual(1);
  });

  it("calls onDismissed after the 1.5s Celebration hold", () => {
    const onDismissed = vi.fn();
    render(<CompletionOverlay bookingId="b1" payoutAmount={500} onDismissed={onDismissed} />);
    expect(onDismissed).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it("renders the Phase-4 title, NOT the SVC-390 'Booking confirmed!' default", () => {
    const onDismissed = vi.fn();
    render(<CompletionOverlay bookingId="b1" payoutAmount={500} onDismissed={onDismissed} />);
    expect(screen.getByText(/great job/i)).toBeInTheDocument();
    expect(screen.queryByText(/booking confirmed/i)).toBeNull();
  });
});
