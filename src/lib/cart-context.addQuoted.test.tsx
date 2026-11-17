/**
 * SVC-416: what the cart stores when a customer picks an SP.
 *
 * Runs the real CartProvider, so these pin the reducer, not a mock of it:
 * the tuple on the line, `unitPrice` = the quote, one line per service with
 * its quantity kept on a re-pick, the "Replace cart?" answer dropping only
 * other SPs' lines, and the steppers keeping the SP.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Service } from "@/lib/mock-data";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

import { CartProvider, useCart, type CartSpQuote } from "@/lib/cart-context";

const SERVICE: Service = {
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
    {
      id: "v-suv",
      label: "SUV",
      subcategory: null,
      price: 599,
      payout: 450,
      duration: "1 hr",
    },
  ],
};
const OTHER: Service = { ...SERVICE, id: "svc-polish", name: "Polish" };

const quote = (over: Partial<CartSpQuote> = {}): CartSpQuote => ({
  spId: "sp-a",
  spName: "Rakesh Plumbing",
  quotedPrice: 450,
  quotedAt: "2026-11-17T10:00:00Z",
  serviceVariantId: "v-hatch",
  outsideRecommendedRange: false,
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

describe("cart.addQuoted", () => {
  it("writes the SP and quote onto a new line, priced at the quote", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(SERVICE, "v-hatch", quote()));

    expect(result.current.items).toEqual([
      {
        serviceId: "svc-wash",
        name: "Car wash",
        quantity: 1,
        variantId: "v-hatch",
        variantLabel: "Hatchback",
        duration: "45 min",
        unitPrice: 450,
        spId: "sp-a",
        spName: "Rakesh Plumbing",
        quotedPrice: 450,
        quotedAt: "2026-11-17T10:00:00Z",
        serviceVariantId: "v-hatch",
        outsideRecommendedRange: false,
      },
    ]);
    expect(result.current.subtotal).toBe(450);
  });

  it("keeps the line on the v2 storage key", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(SERVICE, "v-hatch", quote()));

    const stored = JSON.parse(localStorage.getItem("sc_cart_v2_u1") ?? "[]");
    expect(stored[0]).toMatchObject({ spId: "sp-a", quotedPrice: 450 });
  });

  it("re-picking replaces the line's variant, SP and price but keeps its quantity", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(SERVICE, "v-hatch", quote()));
    act(() => result.current.updateQuantity("svc-wash", 3));
    act(() =>
      result.current.addQuoted(
        SERVICE,
        "v-suv",
        quote({
          spId: "sp-b",
          spName: "Asha Services",
          quotedPrice: 620,
          serviceVariantId: "v-suv",
          outsideRecommendedRange: true,
        }),
      ),
    );

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      serviceId: "svc-wash",
      quantity: 3,
      variantId: "v-suv",
      variantLabel: "SUV",
      duration: "1 hr",
      unitPrice: 620,
      spId: "sp-b",
      spName: "Asha Services",
      quotedPrice: 620,
      serviceVariantId: "v-suv",
      outsideRecommendedRange: true,
    });
  });

  it("re-picking the same SP and variant doesn't bump the quantity", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(SERVICE, "v-hatch", quote()));
    act(() => result.current.addQuoted(SERVICE, "v-hatch", quote()));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(1);
  });

  it("gives a legacy line (added with add()) the SP and quote, keeping its quantity", () => {
    const { result } = renderCart();
    act(() => result.current.add(SERVICE, 2, "v-hatch"));
    act(() => result.current.addQuoted(SERVICE, "v-hatch", quote()));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ quantity: 2, spId: "sp-a", unitPrice: 450 });
  });

  it("replaceOtherSps drops other SPs' lines and keeps lines with no SP", () => {
    const { result } = renderCart();
    const legacy: Service = { ...SERVICE, id: "svc-legacy", name: "Legacy" };
    act(() => result.current.add(legacy, 1));
    act(() => result.current.addQuoted(OTHER, "v-hatch", quote({ spId: "sp-a" })));
    act(() =>
      result.current.addQuoted(SERVICE, "v-hatch", quote({ spId: "sp-b" }), {
        replaceOtherSps: true,
      }),
    );

    expect(result.current.items.map((i) => [i.serviceId, i.spId])).toEqual([
      ["svc-legacy", undefined],
      ["svc-wash", "sp-b"],
    ]);
  });

  it("without replaceOtherSps, leaves other lines alone", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(OTHER, "v-hatch", quote({ spId: "sp-a" })));
    act(() => result.current.addQuoted(SERVICE, "v-hatch", quote({ spId: "sp-a" })));

    expect(result.current.items).toHaveLength(2);
  });
});

describe("the steppers keep the SP", () => {
  it("updateQuantity changes only the quantity", () => {
    const { result } = renderCart();
    act(() => result.current.addQuoted(SERVICE, "v-hatch", quote()));
    const before = result.current.items[0];
    act(() => result.current.updateQuantity("svc-wash", 4));

    expect(result.current.items[0]).toEqual({ ...before, quantity: 4 });
  });
});
