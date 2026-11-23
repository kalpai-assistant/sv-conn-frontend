/**
 * SVC-491 · OnlineToggleCta unit tests.
 *
 * Each case names the failure it catches. The toggle is the money-moment
 * surface, so a regression here (haptic missing, disabled when verified,
 * fires PATCH with the wrong next value) is directly in the critical path.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const hapticImpactMedium = vi.fn();
vi.mock("@/lib/haptics", () => ({
  hapticImpactMedium: () => hapticImpactMedium(),
  // Other symbols aren't called here; mock-return-undefined is fine.
  hapticImpactLight: () => undefined,
  hapticSuccess: () => undefined,
}));
vi.mock("framer-motion", () => ({
  motion: {
    span: ({ children, ...rest }: { children?: ReactNode }) => <span {...rest}>{children}</span>,
  },
  useReducedMotion: () => false,
}));

import { OnlineToggleCta } from "./OnlineToggleCta";

beforeEach(() => {
  hapticImpactMedium.mockReset();
});

describe("OnlineToggleCta", () => {
  // Catches: "the disabled guard silently drops when a provider is
  // unverified — the CTA becomes pressable, the server rejects the PATCH
  // with a quiet 403, and the provider reads it as the toggle not
  // working."
  it("is disabled until the provider is verified", () => {
    const onToggle = vi.fn();
    render(
      <OnlineToggleCta isOnline={false} isVerified={false} pending={false} onToggle={onToggle} />,
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  // Catches: "the toggle commitment moment doesn't buzz through-pocket —
  // the user taps and feels nothing, which reads as the tap not having
  // registered."
  it("fires hapticImpactMedium on each tap when enabled", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<OnlineToggleCta isOnline={false} isVerified pending={false} onToggle={onToggle} />);

    await user.click(screen.getByRole("button"));
    expect(hapticImpactMedium).toHaveBeenCalledTimes(1);
  });

  // Catches: "onToggle fires with the current value instead of the
  // intended next — tapping 'Offline' sends `false` to the PATCH when it
  // should send `true`, provider thinks they went online but they didn't."
  it("calls onToggle with the intended next state", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<OnlineToggleCta isOnline={false} isVerified pending={false} onToggle={onToggle} />);

    await user.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  // Catches: "the PATCH-in-flight window lets a provider double-tap and
  // enqueue two conflicting mutations."
  it("is disabled while pending", () => {
    render(<OnlineToggleCta isOnline onToggle={vi.fn()} isVerified pending />);

    expect(screen.getByRole("button")).toBeDisabled();
  });

  // Catches: "aria-pressed falls off the Button, so a screen reader
  // reads the online state as the tap target rather than its state."
  it("exposes the toggle state via aria-pressed", () => {
    const { rerender } = render(
      <OnlineToggleCta isOnline={false} isVerified pending={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    rerender(<OnlineToggleCta isOnline isVerified pending={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});
