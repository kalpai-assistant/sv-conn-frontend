/**
 * SVC-350: logout — and belt-and-braces, login — must leave no user-scoped
 * cache behind. The failure mode this guards is a shared device where user B
 * sees user A's bookings / profile / cart because React Query, localStorage,
 * or both still carry them. DPDP-adjacent (booking lists carry phone + address).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./auth-context";
import { CartProvider, useCart } from "./cart-context";
import type { Service } from "./mock-data";

// `clearFcmToken` awaits a dynamic import to `@capacitor/push-notifications`,
// which jsdom can't resolve. Stubbed to a no-op so the logout path under
// test is isolated to the state teardown this ticket is really about.
vi.mock("./fcm", () => ({
  clearFcmToken: vi.fn().mockResolvedValue(undefined),
  useFcmRegistration: () => {},
}));

const MOCK_SERVICE: Service = {
  id: "svc-wash",
  name: "Car wash",
  categoryId: "auto",
  categoryName: "Auto",
  description: "",
  price: 299,
  payout: 90,
  duration: "30 min",
  variants: [
    { id: "v1", label: "Hatchback", subcategory: null, price: 299, payout: 90, duration: "30 min" },
  ],
};

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>
          <CartProvider>{children}</CartProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => ({ auth: useAuth(), cart: useCart() }), {
    wrapper: makeWrapper(client),
  });
  return { client, result };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("session teardown (SVC-350)", () => {
  it("logout wipes React Query cache, cart items, and sc_* localStorage keys", async () => {
    const { client, result } = mount();

    await act(async () => {
      result.current.auth.login("at", "rt", {
        id: "u1",
        name: "User A",
        phone: "+911111111111",
        email: null,
        role: "consumer",
      });
    });

    // Prime user A's caches: React Query (/users/me, /bookings), the cart
    // (which writes `sc_cart_v2_u1`), and the one non-user-scoped key that
    // sits in the way of a clean handoff (`sc_selected_address_id`).
    client.setQueryData(["users", "me"], { name: "A" });
    client.setQueryData(["bookings"], [{ id: "b1" }]);
    await act(async () => {
      result.current.cart.add(MOCK_SERVICE);
    });
    localStorage.setItem("sc_selected_address_id", "addr-a");

    expect(client.getQueryCache().getAll().length).toBeGreaterThan(0);
    expect(result.current.cart.items.length).toBe(1);
    expect(localStorage.getItem("sc_cart_v2_u1")).not.toBeNull();
    expect(localStorage.getItem("sc_selected_address_id")).toBe("addr-a");

    await act(async () => {
      result.current.auth.logout();
    });

    expect(client.getQueryCache().getAll()).toEqual([]);
    expect(result.current.cart.items).toEqual([]);
    const scKeys = Object.keys(localStorage).filter((k) => k.startsWith("sc_"));
    expect(scKeys).toEqual([]);
  });

  it("login clears again — belt-and-braces for same-session account switch", async () => {
    const { client, result } = mount();

    // Simulated residue from a prior session that somehow survived — the
    // scenario the ticket calls out as "same session, different account".
    client.setQueryData(["users", "me"], { name: "A" });
    localStorage.setItem("sc_selected_address_id", "stale");

    await act(async () => {
      result.current.auth.login("at", "rt", {
        id: "u2",
        name: "User B",
        phone: "+911111111112",
        email: null,
        role: "consumer",
      });
    });

    expect(client.getQueryCache().getAll()).toEqual([]);
    expect(localStorage.getItem("sc_selected_address_id")).toBeNull();
  });

  it("clearSession is the sole entry point — guards against future drift", () => {
    // If a future dev adds a third cache-clearing path (sign-out-everywhere,
    // token-refresh reset, …) they MUST route it through `clearSession` too.
    // Both `login` and `logout` call it today, imported from `./session`.
    const source = readFileSync(resolve(__dirname, "./auth-context.tsx"), "utf8");
    const callSites = source.match(/clearSession\(/g) ?? [];
    expect(callSites.length).toBe(2);
    expect(source).toMatch(/from ["']\.\/session["']/);
  });
});
