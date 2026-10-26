/**
 * SVC-398: the quick-add control fires a Light impact when a service enters
 * the cart, and nothing on the stepper's +/- taps.
 *
 * The ticket is specific: haptics are reserved for primary success moments.
 * Add-to-cart counts; adjusting quantity 1→2→3 does not. These assertions
 * nail the distinction down so a future "let's also buzz on increment" edit
 * has to flip a test, not sneak in silently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const hapticImpactLight = vi.fn();
const add = vi.fn();
const updateQuantity = vi.fn();
const cartItems = vi.hoisted(() => ({
  current: [] as Array<{ serviceId: string; quantity: number }>,
}));

vi.mock("@/lib/haptics", () => ({
  hapticImpactLight: (...args: unknown[]) => hapticImpactLight(...args),
}));
vi.mock("@/lib/cart-context", () => ({
  useCart: () => ({ items: cartItems.current, add, updateQuantity }),
}));

import { QuickAddButton } from "@/components/service/QuickAddButton";

const service = {
  id: "svc-a",
  name: "Deep clean",
  variants: [{ id: "v1", label: "Studio", price: 499, duration: "45 min" }],
} as Parameters<typeof QuickAddButton>[0]["service"];

beforeEach(() => {
  cartItems.current = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("QuickAddButton haptics", () => {
  it("fires a Light impact once per add-to-cart", async () => {
    render(<QuickAddButton service={service} />);
    await userEvent.click(screen.getByRole("button", { name: /add deep clean/i }));

    expect(add).toHaveBeenCalledOnce();
    expect(hapticImpactLight).toHaveBeenCalledOnce();
  });

  it("stays silent on + / − stepper taps", async () => {
    // In-cart state: the stepper renders instead of the ADD pill. Buzzing on
    // every increment would dull the add-to-cart signal to the point of noise.
    cartItems.current = [{ serviceId: service.id, quantity: 2 }];
    render(<QuickAddButton service={service} />);

    await userEvent.click(screen.getByRole("button", { name: /increase/i }));
    await userEvent.click(screen.getByRole("button", { name: /decrease/i }));

    expect(updateQuantity).toHaveBeenCalledTimes(2);
    expect(hapticImpactLight).not.toHaveBeenCalled();
  });
});
