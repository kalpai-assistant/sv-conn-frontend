/**
 * The quick-add control: "+" opens the pro-selection sheet (SVC-416), and the
 * +/− stepper on a line already in the cart only changes the quantity.
 *
 * SVC-398's haptic rule still holds: one Light impact per add-to-cart, none on
 * the stepper. Since SVC-416 a tap on "+" doesn't add anything (the line lands
 * when an SP is picked), so the buzz moved into the sheet
 * (ProSelectionSheet.test.tsx asserts it there) and "+" stays silent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const hapticImpactLight = vi.fn();
const add = vi.fn();
const updateQuantity = vi.fn();
const openProSelection = vi.fn();
const cartItems = vi.hoisted(() => ({
  current: [] as Array<{ serviceId: string; quantity: number; spId?: string }>,
}));

vi.mock("@/lib/haptics", () => ({
  hapticImpactLight: (...args: unknown[]) => hapticImpactLight(...args),
}));
vi.mock("@/lib/cart-context", () => ({
  useCart: () => ({ items: cartItems.current, add, updateQuantity }),
}));
vi.mock("@/lib/pro-selection-context", () => ({
  useProSelection: () => ({ openProSelection }),
}));

import { QuickAddButton } from "@/components/service/QuickAddButton";

const service = {
  id: "svc-a",
  name: "Deep clean",
  variants: [
    { id: "v1", label: "Studio", price: 499, duration: "45 min" },
    { id: "v2", label: "1 BHK", price: 799, duration: "1 hr" },
  ],
} as Parameters<typeof QuickAddButton>[0]["service"];

beforeEach(() => {
  cartItems.current = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("QuickAddButton", () => {
  it("opens the pro-selection sheet for the first variant, adding nothing yet", async () => {
    render(<QuickAddButton service={service} />);
    await userEvent.click(screen.getByRole("button", { name: /add deep clean/i }));

    expect(openProSelection).toHaveBeenCalledExactlyOnceWith(service, "v1");
    expect(add).not.toHaveBeenCalled();
    expect(hapticImpactLight).not.toHaveBeenCalled();
  });

  it("keeps the tap from reaching the card underneath", async () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <QuickAddButton service={service} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: /add deep clean/i }));

    expect(onCardClick).not.toHaveBeenCalled();
  });

  // That the line keeps its SP across +/− is the reducer's job:
  // cart-context.addQuoted.test.tsx, "the steppers keep the SP".
  it("steppers change only the quantity and never reopen the sheet", async () => {
    cartItems.current = [{ serviceId: service.id, quantity: 2, spId: "sp-a" }];
    render(<QuickAddButton service={service} />);

    await userEvent.click(screen.getByRole("button", { name: /increase/i }));
    await userEvent.click(screen.getByRole("button", { name: /decrease/i }));

    expect(updateQuantity).toHaveBeenNthCalledWith(1, service.id, 3);
    expect(updateQuantity).toHaveBeenNthCalledWith(2, service.id, 1);
    expect(openProSelection).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(hapticImpactLight).not.toHaveBeenCalled();
  });
});
