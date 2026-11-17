/**
 * SVC-417 + SVC-411 (frontend): the cart books with the chosen pro at the
 * quoted price.
 *
 * - A line with no pro shows "Choose a pro", has no price, and holds Book.
 * - "Choose a pro" / "Change pro" open the sheet for that line's service and
 *   variant.
 * - A line with a pro shows who, the out-of-range note, and "Change pro".
 * - The request carries sp_id + per item service_variant_id + quoted_price,
 *   and nothing the backend doesn't take.
 * - 409 PRICE_CHANGED → "Price updated" → Confirm re-prices and books again.
 * - 409 SP_UNAVAILABLE → dialog → the lines go back to "Choose a pro" and the
 *   sheet opens.
 *
 * The cart context is a mock: its reducer has its own suite
 * (cart-context.svc417.test.tsx). What this file pins is the route.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { CartLineItem } from "@/lib/cart-context";
import type { Service } from "@/lib/mock-data";

const navigate = vi.fn();
const bookAndPay = vi.fn();
const openProSelection = vi.fn();
const storePriceChanges = vi.fn();
const clearPro = vi.fn();
let cartItems: CartLineItem[] = [];
let catalogue: Service[] | undefined;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
  useNavigate: () => navigate,
  useSearch: () => ({}),
}));

vi.mock("@/lib/cart-context", () => {
  return {
    useCart: () => ({
      items: cartItems,
      subtotal: cartItems.reduce((s, i) => (i.spId ? s + i.unitPrice * i.quantity : s), 0),
      needsProCount: cartItems.filter((i) => !i.spId).length,
      totalQuantity: cartItems.reduce((n, i) => n + i.quantity, 0),
      updateQuantity: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      applyPriceChanges: storePriceChanges,
      clearPro,
    }),
  };
});

vi.mock("@/lib/pro-selection-context", () => ({
  useProSelection: () => ({ openProSelection, closeProSelection: vi.fn() }),
}));
vi.mock("@/hooks/useApi", () => ({
  useServices: () => ({ data: catalogue }),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u-1", name: "Tester" } }),
}));
const ADDRESS = { id: "addr-1", label: "home", full: "Karve Nagar" };
vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({
    selected: ADDRESS,
    setSelectedId: vi.fn(),
    addresses: [ADDRESS],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useBookAndPay", () => ({
  useBookAndPay: () => ({ bookAndPay, isBusy: false }),
}));
vi.mock("@/components/SavedAddressesSheet", () => ({ SavedAddressesSheet: () => null }));
vi.mock("@/components/cart/SlotPickerSheet", () => ({ SlotPickerSheet: () => null }));
vi.mock("@/components/cart/CouponsSheet", () => ({ CouponsSheet: () => null }));
vi.mock("@/components/cart/PricingBreakdown", () => ({
  PricingBreakdown: ({ subtotal }: { subtotal: number }) => (
    <div data-testid="pricing">{subtotal}</div>
  ),
}));
vi.mock("@/components/AccountAvatar", () => ({ AccountAvatar: () => null }));
vi.mock("@/lib/last-payment-method", () => ({
  readLastPaymentMethod: () => "cash",
  writeLastPaymentMethod: vi.fn(),
}));

import { CHOOSE_PRO_FOR_EACH, CartPage, REMOVE_UNAVAILABLE } from "@/routes/cart";

const WASH: Service = {
  id: "svc-wash",
  name: "Car wash",
  categoryId: "c1",
  categoryName: "Vehicle",
  description: "",
  price: 399,
  payout: 300,
  duration: "45 min",
  variants: [
    { id: "v-hatch", label: "Hatchback", subcategory: null, price: 399, payout: 300 },
    { id: "v-suv", label: "SUV", subcategory: null, price: 599, payout: 450 },
  ],
};

const noProLine = (over: Partial<CartLineItem> = {}): CartLineItem => ({
  serviceId: "svc-wash",
  variantId: "v-suv",
  variantLabel: "SUV",
  name: "Car wash",
  unitPrice: 599,
  quantity: 1,
  ...over,
});

const proLine = (over: Partial<CartLineItem> = {}): CartLineItem =>
  noProLine({
    unitPrice: 450,
    quantity: 2,
    spId: "sp-a",
    spName: "Rakesh",
    quotedPrice: 450,
    quotedAt: "2026-11-17T10:00:00Z",
    serviceVariantId: "v-suv",
    outsideRecommendedRange: false,
    ...over,
  });

function bookButton() {
  return screen.getByRole("button", {
    name: /^book|choose a pro for each service|remove unavailable services/i,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  cartItems = [];
  catalogue = [WASH];
});

describe("a line with no pro", () => {
  it("shows 'Choose a pro' instead of a price, no total, and holds Book", () => {
    cartItems = [noProLine()];
    render(<CartPage />);

    expect(screen.getByRole("button", { name: "Choose a pro for Car wash SUV" })).toBeEnabled();
    expect(screen.queryByText("₹599")).toBeNull();
    // No PricingBreakdown: a ₹0 subtotal would read as the bill.
    expect(screen.queryByTestId("pricing")).toBeNull();
    expect(bookButton()).toBeDisabled();
    expect(bookButton()).toHaveTextContent(CHOOSE_PRO_FOR_EACH);
  });

  it("is left out of the subtotal when another line has a pro", () => {
    catalogue = [WASH, { ...WASH, id: "svc-other", name: "Polish" }];
    cartItems = [proLine({ serviceId: "svc-other", name: "Polish" }), noProLine()];
    render(<CartPage />);

    expect(bookButton()).toBeDisabled();
    expect(screen.getByText("Choose a pro for each service to see your total.")).toBeTruthy();
  });

  it("opens the sheet with that line's service and variant", async () => {
    cartItems = [noProLine()];
    render(<CartPage />);

    await userEvent.click(screen.getByRole("button", { name: "Choose a pro for Car wash SUV" }));

    expect(openProSelection).toHaveBeenCalledWith(WASH, "v-suv");
  });

  it("falls back to the service's first variant when the line's is gone", async () => {
    cartItems = [noProLine({ variantId: "v-retired" })];
    render(<CartPage />);

    await userEvent.click(screen.getByRole("button", { name: /choose a pro for car wash/i }));

    expect(openProSelection).toHaveBeenCalledWith(WASH, "v-hatch");
  });

  it("waits for the catalogue before it can open the sheet", () => {
    catalogue = undefined;
    cartItems = [noProLine()];
    render(<CartPage />);

    expect(screen.getByRole("button", { name: "Choose a pro for Car wash SUV" })).toBeDisabled();
  });

  it("shows 'No longer available' for a service the catalogue dropped", () => {
    catalogue = [];
    cartItems = [noProLine()];
    render(<CartPage />);

    expect(screen.getByText("No longer available")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /choose a pro for car wash/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /increase/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Car wash SUV" })).toBeTruthy();
  });
});

describe("a line with a pro", () => {
  it("shows the pro's name, the line total at the quote, and 'Change pro'", async () => {
    cartItems = [proLine()];
    render(<CartPage />);

    expect(screen.getByText("SUV · Rakesh")).toBeTruthy();
    expect(screen.getByText("₹900")).toBeTruthy();
    expect(screen.queryByText("This pro's price is outside our recommended range")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Change pro for Car wash SUV" }));
    expect(openProSelection).toHaveBeenCalledWith(WASH, "v-suv");
  });

  it("names a pro without a name 'Service pro'", () => {
    cartItems = [proLine({ spName: null })];
    render(<CartPage />);
    expect(screen.getByText("SUV · Service pro")).toBeTruthy();
  });

  it("keeps the out-of-range note from the sheet", () => {
    cartItems = [proLine({ outsideRecommendedRange: true })];
    render(<CartPage />);
    expect(screen.getByText("This pro's price is outside our recommended range")).toBeTruthy();
  });

  it("drops the 'a pro who can do all N services' note: the pro is chosen", () => {
    cartItems = [proLine(), proLine({ serviceId: "svc-other", name: "Polish" })];
    render(<CartPage />);
    expect(screen.queryByText(/look for a pro who can do all/i)).toBeNull();
  });
});

describe("a line with a pro whose service left the catalogue", () => {
  it("can only be removed, has no price, and holds Book", () => {
    // create_booking refuses an inactive or unknown service with a 400, so
    // leaving it bookable would end in a raw error toast.
    catalogue = [];
    cartItems = [proLine({ outsideRecommendedRange: true })];
    render(<CartPage />);

    expect(screen.getByText("No longer available")).toBeTruthy();
    expect(screen.queryByText("₹900")).toBeNull();
    expect(screen.queryByText(/Rakesh/)).toBeNull();
    expect(screen.queryByText("This pro's price is outside our recommended range")).toBeNull();
    expect(screen.queryByRole("button", { name: /change pro/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /increase/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Car wash SUV" })).toBeTruthy();
    expect(screen.queryByTestId("pricing")).toBeNull();
    expect(screen.getByText("Remove unavailable services to see your total.")).toBeTruthy();
    expect(bookButton()).toBeDisabled();
    expect(bookButton()).toHaveTextContent(REMOVE_UNAVAILABLE);
  });

  it("is left out of the totals next to a bookable line", () => {
    const POLISH: Service = {
      ...WASH,
      id: "svc-polish",
      name: "Polish",
      variants: [{ id: "v-p", label: "Std", subcategory: null, price: 299, payout: 200 }],
    };
    catalogue = [POLISH];
    cartItems = [
      proLine(),
      proLine({ serviceId: "svc-polish", name: "Polish", variantId: "v-p", variantLabel: "Std" }),
    ];
    render(<CartPage />);

    expect(bookButton()).toBeDisabled();
    expect(screen.getAllByText("No longer available")).toHaveLength(1);
    // Polish keeps its price; the wash line has none and no bill is shown.
    expect(screen.getAllByText("₹900")).toHaveLength(1);
    expect(screen.queryByTestId("pricing")).toBeNull();
  });
});

describe("booking", () => {
  it("sends sp_id once and each item's variant + quoted price, nothing else", async () => {
    cartItems = [proLine()];
    render(<CartPage />);

    expect(bookButton()).toBeEnabled();
    await userEvent.click(bookButton());

    expect(bookAndPay).toHaveBeenCalledOnce();
    const { booking, items } = bookAndPay.mock.calls[0][0];
    expect(booking.sp_id).toBe("sp-a");
    expect(booking.items).toEqual([
      { service_id: "svc-wash", quantity: 2, service_variant_id: "v-suv", quoted_price: 450 },
    ]);
    expect(JSON.stringify(booking)).not.toMatch(/quoted_at|price_unit/);
    expect(items).toEqual(cartItems);
  });
});

describe("409 PRICE_CHANGED", () => {
  const changed = {
    kind: "price-changed" as const,
    items: [
      { serviceId: "svc-wash", serviceVariantId: "v-suv", quotedPrice: 450, currentPrice: 520 },
    ],
  };

  async function bookIntoPriceChange() {
    bookAndPay.mockImplementationOnce(async (a: { onConflict: (c: unknown) => void }) =>
      a.onConflict(changed),
    );
    cartItems = [proLine()];
    render(<CartPage />);
    await userEvent.click(bookButton());
    return screen.findByRole("alertdialog");
  }

  it("lists each changed line old → new", async () => {
    const dialog = await bookIntoPriceChange();

    expect(within(dialog).getByText("Price updated")).toBeTruthy();
    const row = within(dialog).getByRole("listitem");
    expect(row).toHaveTextContent("Car wash · SUV");
    expect(row).toHaveTextContent("₹450 → ₹520");
  });

  it("Confirm re-prices the lines and books again at the new price", async () => {
    const dialog = await bookIntoPriceChange();

    await userEvent.click(within(dialog).getByRole("button", { name: "Book at new price" }));

    expect(storePriceChanges).toHaveBeenCalledWith([
      { serviceVariantId: "v-suv", currentPrice: 520 },
    ]);
    expect(bookAndPay).toHaveBeenCalledTimes(2);
    const second = bookAndPay.mock.calls[1][0];
    expect(second.booking.items[0]).toMatchObject({
      quoted_price: 520,
      service_variant_id: "v-suv",
    });
    expect(second.items[0]).toMatchObject({ quotedPrice: 520, unitPrice: 520 });
  });

  it("Cancel changes nothing", async () => {
    const dialog = await bookIntoPriceChange();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(storePriceChanges).not.toHaveBeenCalled();
    expect(bookAndPay).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("409 SP_UNAVAILABLE", () => {
  it("takes the pro's lines back to 'Choose a pro' and opens the sheet", async () => {
    bookAndPay.mockImplementationOnce(async (a: { onConflict: (c: unknown) => void }) =>
      a.onConflict({ kind: "sp-unavailable" }),
    );
    cartItems = [proLine()];
    render(<CartPage />);
    await userEvent.click(bookButton());

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("This pro can't take your booking right now")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Choose another pro" }));

    expect(clearPro).toHaveBeenCalledWith("sp-a");
    expect(openProSelection).toHaveBeenCalledWith(WASH, "v-suv");
  });
});
