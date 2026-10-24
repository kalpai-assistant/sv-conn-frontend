/**
 * Celebration overlay + inline pulse (SVC-390). Pinned:
 *
 *   - Celebration auto-dismisses after exactly 1.5s and fires onComplete
 *     once — the brief says 1.5s hold before navigating to tracking, so
 *     a drift here changes the whole post-booking choreography;
 *   - the overlay carries the core copy ("Booking confirmed!" + "Your pro
 *     is on the way") so a reader skimming the screenshot alone knows
 *     exactly what state the app is in;
 *   - InlineCelebration renders its label, so OTP-verified / coupon-applied
 *     micro-wins have a readable surface, not just an icon.
 *
 * The confetti animation + prefers-reduced-motion branch intentionally
 * aren't pinned by assertions — jsdom's framer-motion runs synchronously
 * and the visual spring details are not what the ticket is enforcing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { Celebration, InlineCelebration } from "@/components/Celebration";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Celebration overlay", () => {
  it("fires onComplete after exactly 1.5s", () => {
    const onComplete = vi.fn();
    render(<Celebration onComplete={onComplete} />);

    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("renders the confirmation copy — a screenshot alone must tell the story", () => {
    render(<Celebration />);
    expect(screen.getByText("Booking confirmed!")).toBeInTheDocument();
    expect(screen.getByText("Your pro is on the way")).toBeInTheDocument();
  });

  it("does NOT crash when no onComplete is passed", () => {
    // A caller that just wants a 1.5s celebration without an onward
    // navigation (dev-tool preview, for example) must not blow up on the
    // optional callback.
    expect(() => {
      render(<Celebration />);
      act(() => {
        vi.advanceTimersByTime(1500);
      });
    }).not.toThrow();
  });
});

describe("InlineCelebration", () => {
  it("renders the label it was given", () => {
    render(<InlineCelebration label="OTP verified" />);
    expect(screen.getByText("OTP verified")).toBeInTheDocument();
  });

  it("falls back to 'Done' when no label is supplied", () => {
    render(<InlineCelebration />);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
