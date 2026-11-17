/**
 * SVC-417 / SVC-411: the cart's "Choose a pro" lines and the 409 updates.
 *
 * Runs the real CartProvider. What these pin:
 * - a line without a pro stays in the cart but out of `subtotal`;
 * - a 409 PRICE_CHANGED re-prices only the named lines;
 * - a 409 SP_UNAVAILABLE takes that pro's lines back to "Choose a pro" and
 *   keeps their variant, so the sheet reopens on the same option;
 * - `add()` with a different variant drops the old variant's quote.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Service } from "@/lib/mock-data";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

import { CartProvider, useCart, type CartLineItem, type CartSpQuote } from "@/lib/cart-context";
import { applyPriceChanges } from "@/lib/cart-pricing";

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
const POLISH: Service = {
  ...WASH,
  id: "svc-polish",
  name: "Polish",
  variants: [{ id: "v-polish", label: "Standard", subcategory: null, price: 299, payout: 200 }],
};

const quote = (over: Partial<CartSpQuote> = {}): CartSpQuote => ({
  spId: "sp-a",
  spName: "Rakesh",
  quotedPrice: 450,
  quotedAt: "2026-11-17T10:00:00Z",
  serviceVariantId: "v-hatch",
  outsideRecommendedRange: true,
  ...over,
});

function renderCart() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <CartProvider>{children}</CartProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useCart(), { wrapper });
}

beforeEach(() => {
  localStorage.clear();
});

describe("Choose-a-pro lines", () => {
  it("keeps a line with no pro, but leaves it out of the subtotal", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(WASH, "v-hatch", quote()));
    act(() => result.current.add(POLISH, 2));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.subtotal).toBe(450);
    expect(result.current.needsProCount).toBe(1);
    expect(result.current.totalQuantity).toBe(3);
  });

  it("an all-unpriced cart has a zero subtotal and every line needs a pro", () => {
    const { result } = renderCart();
    act(() => result.current.add(WASH));
    act(() => result.current.add(POLISH));

    expect(result.current.subtotal).toBe(0);
    expect(result.current.needsProCount).toBe(2);
  });
});

describe("add() on a line with a pro", () => {
  it("a different variant drops the old variant's quote", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(WASH, "v-hatch", quote()));
    act(() => result.current.add(WASH, 1, "v-suv"));

    const [line] = result.current.items;
    expect(line.variantId).toBe("v-suv");
    expect(line.spId).toBeUndefined();
    expect(line.quotedPrice).toBeUndefined();
    expect(line.serviceVariantId).toBeUndefined();
    expect(result.current.needsProCount).toBe(1);
  });

  it("the same variant bumps the quantity and keeps the pro", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(WASH, "v-hatch", quote()));
    act(() => result.current.add(WASH, 1, "v-hatch"));

    const [line] = result.current.items;
    expect(line.quantity).toBe(2);
    expect(line.spId).toBe("sp-a");
    expect(result.current.subtotal).toBe(900);
  });
});

describe("409 PRICE_CHANGED → applyPriceChanges", () => {
  it("re-prices the named lines at the live price and stamps a new quotedAt", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(WASH, "v-hatch", quote()));
    act(() =>
      result.current.addQuoted(
        POLISH,
        "v-polish",
        quote({ quotedPrice: 300, serviceVariantId: "v-polish" }),
      ),
    );

    act(() =>
      result.current.applyPriceChanges([{ serviceVariantId: "v-hatch", currentPrice: 520 }]),
    );

    const [wash, polish] = result.current.items;
    expect(wash.quotedPrice).toBe(520);
    expect(wash.unitPrice).toBe(520);
    expect(wash.quotedAt).not.toBe("2026-11-17T10:00:00Z");
    expect(polish.quotedPrice).toBe(300);
    expect(result.current.subtotal).toBe(820);
  });

  it("the pure helper matches by serviceVariantId and leaves other lines as they were", () => {
    const lines: CartLineItem[] = [
      {
        serviceId: "s1",
        variantId: "v1",
        name: "A",
        unitPrice: 100,
        quantity: 2,
        spId: "sp",
        quotedPrice: 100,
        serviceVariantId: "v1",
      },
      { serviceId: "s2", variantId: "v2", name: "B", unitPrice: 50, quantity: 1 },
    ];
    const now = new Date("2026-11-17T12:00:00Z");
    const next = applyPriceChanges(lines, [{ serviceVariantId: "v1", currentPrice: 120 }], now);

    expect(next[0]).toMatchObject({
      unitPrice: 120,
      quotedPrice: 120,
      quotedAt: now.toISOString(),
    });
    expect(next[1]).toBe(lines[1]);
  });
});

describe("409 SP_UNAVAILABLE → clearPro", () => {
  it("takes that pro's lines back to 'Choose a pro', keeping variant and quantity", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(WASH, "v-suv", quote({ serviceVariantId: "v-suv" })));
    act(() => result.current.updateQuantity("svc-wash", 3));

    act(() => result.current.clearPro("sp-a"));

    const [line] = result.current.items;
    expect(line).toMatchObject({
      serviceId: "svc-wash",
      variantId: "v-suv",
      variantLabel: "SUV",
      quantity: 3,
    });
    for (const field of [
      "spId",
      "spName",
      "quotedPrice",
      "quotedAt",
      "serviceVariantId",
      "outsideRecommendedRange",
    ]) {
      expect(line).not.toHaveProperty(field);
    }
    expect(result.current.subtotal).toBe(0);
    expect(result.current.needsProCount).toBe(1);
  });

  it("leaves another pro's lines alone", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(WASH, "v-hatch", quote()));
    act(() => result.current.clearPro("sp-other"));
    expect(result.current.items[0].spId).toBe("sp-a");
  });
});
