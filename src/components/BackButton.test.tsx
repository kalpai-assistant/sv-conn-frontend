/**
 * Header back arrow (SVC-278 issue 1).
 *
 * The bug this guards against is invisible in a screenshot: the arrow looked
 * right and went to the wrong place. Reaching a service from Cleaning and
 * tapping back landed on Categories, so adding a second service from the same
 * category meant navigating in from the top every time.
 *
 * The load-bearing assertion is `history.back()` — a test that only checked
 * the fallback would pass against the old hardcoded `<Link to="/">`, which is
 * exactly the bug.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const back = vi.fn();
const navigate = vi.fn();
let canGoBack = true;

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: { canGoBack: () => canGoBack, back }, navigate }),
}));

import { BackButton } from "@/components/BackButton";

describe("with somewhere to go back to", () => {
  it("pops history rather than jumping to the fallback", async () => {
    canGoBack = true;
    back.mockClear();
    navigate.mockClear();
    render(<BackButton fallbackTo="/" />);

    await userEvent.click(screen.getByLabelText("Back"));

    // The whole bug: this used to navigate to "/" unconditionally, so a user
    // who arrived from a category listing was thrown back to Categories.
    expect(back).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("opened cold", () => {
  it("falls back, replacing the dead-end entry", async () => {
    // A deep link, a shared URL, a notification tap — nothing precedes this
    // screen, so popping would leave the app. `replace` keeps the dead end
    // from becoming somewhere back returns to.
    canGoBack = false;
    back.mockClear();
    navigate.mockClear();
    render(<BackButton fallbackTo="/" />);

    await userEvent.click(screen.getByLabelText("Back"));

    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("honours the fallback it was given, not a hardcoded home", async () => {
    canGoBack = false;
    navigate.mockClear();
    render(<BackButton fallbackTo="/bookings" />);

    await userEvent.click(screen.getByLabelText("Back"));

    expect(navigate).toHaveBeenCalledWith({ to: "/bookings", replace: true });
  });
});
