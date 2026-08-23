/**
 * Cart state — the multi-service basket the consumer builds up before
 * hitting Checkout.
 *
 * Two knobs the design turns:
 *
 * 1. **Persisted in localStorage, per-user.** A user who adds a service,
 *    switches tabs, and comes back tomorrow should see the same cart.
 *    Keyed on user id so a shared device with two logins doesn't leak
 *    one cart into the other, and cleared on logout.
 * 2. **In-memory line items are enough** — we don't persist item pricing
 *    against the *backend*. The backend re-validates prices at booking
 *    creation (service.base_price at insert time), so a client that
 *    hoards a stale unitPrice can't pay less than the current sticker
 *    price. See `app/services/booking_service.py::create_booking`.
 *
 * Same-service duplicates are merged into `quantity` — matches the
 * backend's `UNIQUE(booking_id, service_id)` constraint (see
 * `backend/app/models/booking_item.py`). Attempting to add a service
 * that's already in the cart bumps its quantity instead.
 *
 * A line therefore stays keyed on `serviceId` alone even now that it carries
 * a variant (SVC-232): that same UNIQUE constraint means one booking cannot
 * hold two variants of one service, so a cart that could express "Hatchback
 * wash + SUV wash" would only fail at checkout with an integrity error.
 * Re-selecting a different variant REPLACES the one on the existing line.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./auth-context";
import type { Service } from "./mock-data";

// v2 (SVC-232): line items gained `variantId`. A cart persisted under v1
// predates that field, so loading one would send no service_variant_id and
// the backend would fall back to the service's first variant — the exact bug
// this ticket fixes, reproduced silently and only for users who happened to
// have a cart open across the deploy.
//
// Bumping the prefix abandons v1 carts rather than migrating them. Every v1
// line lacks a variant, so a migration would drop all of them anyway; the
// prefix gets the same outcome without a permanent filter in the load path.
const STORAGE_KEY_PREFIX = "sc_cart_v2_";

export interface CartLineItem {
  serviceId: string;
  // Which priced option of the service this line is for. Optional only for
  // services the catalogue hasn't priced with variants; when set it is what
  // the booking is actually placed against.
  variantId?: string;
  /** Shown next to the service name — "Full home deep cleaning · 2 BHK". */
  variantLabel?: string;
  // Denormalised for offline display. Never trusted at booking time —
  // backend recomputes from the variant's own price.
  name: string;
  unitPrice: number;
  quantity: number;
  duration?: string;
}

interface CartContextValue {
  items: CartLineItem[];
  totalQuantity: number;
  subtotal: number;
  add: (service: Service, quantity?: number, variantId?: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function storageKey(userId: string | undefined): string | null {
  // No user → no persisted cart. The provider still holds items in
  // memory (the cart works during the tiny window before auth hydrates)
  // but nothing survives a reload. Once the user is known, we adopt
  // whatever's in memory into their storage slot.
  return userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;
}

function loadCart(userId: string | undefined): CartLineItem[] {
  const key = storageKey(userId);
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CartLineItem[]) : [];
  } catch {
    return [];
  }
}

function saveCart(userId: string | undefined, items: CartLineItem[]) {
  const key = storageKey(userId);
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Private mode / quota — the in-memory cart still works this session.
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [items, setItems] = useState<CartLineItem[]>(() => loadCart(userId));

  // On login (or user change) re-read from that user's storage slot.
  // A stale cart from a previous session belongs to a different user
  // and must not leak.
  useEffect(() => {
    setItems(loadCart(userId));
  }, [userId]);

  // Persist on every change. Reads happen on mount; writes happen on
  // every mutation. localStorage writes are cheap enough here (small
  // JSON blob) to skip debouncing.
  useEffect(() => {
    saveCart(userId, items);
  }, [userId, items]);

  const add = useCallback((service: Service, quantity = 1, variantId?: string) => {
    // Default to the first active variant so a caller that doesn't pass one
    // still books something explicit, rather than leaving the choice to the
    // backend's fallback — which is how every Vehicle Wash was sold at
    // Hatchback pricing (SVC-232).
    const variant =
      service.variants.find((v) => v.id === variantId) ?? service.variants[0] ?? undefined;

    setItems((prev) => {
      const existing = prev.findIndex((i) => i.serviceId === service.id);
      if (existing >= 0) {
        const line = prev[existing];
        const next = [...prev];
        if (line.variantId === variant?.id) {
          // Same service, same variant: bump quantity.
          next[existing] = { ...line, quantity: line.quantity + quantity };
        } else {
          // Same service, DIFFERENT variant. A booking can hold only one row
          // per service (uix_booking_item_service), so this replaces the
          // choice rather than adding a second line — and re-prices the line
          // to match. Quantity is preserved: the user changed which option
          // they want, not how many.
          next[existing] = {
            ...line,
            variantId: variant?.id,
            variantLabel: variant?.label,
            unitPrice: variant?.price ?? service.price,
            duration: variant?.duration ?? service.duration,
          };
        }
        return next;
      }
      return [
        ...prev,
        {
          serviceId: service.id,
          variantId: variant?.id,
          variantLabel: variant?.label,
          name: service.name,
          unitPrice: variant?.price ?? service.price,
          quantity,
          duration: variant?.duration ?? service.duration,
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((serviceId: string, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) {
        return prev.filter((i) => i.serviceId !== serviceId);
      }
      return prev.map((i) => (i.serviceId === serviceId ? { ...i, quantity } : i));
    });
  }, []);

  const remove = useCallback((serviceId: string) => {
    setItems((prev) => prev.filter((i) => i.serviceId !== serviceId));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const totalQuantity = items.reduce((n, i) => n + i.quantity, 0);
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    return { items, totalQuantity, subtotal, add, updateQuantity, remove, clear };
  }, [items, add, updateQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be called inside <CartProvider>");
  }
  return ctx;
}
