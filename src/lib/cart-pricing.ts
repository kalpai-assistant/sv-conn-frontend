/**
 * SVC-411: the cart's half of a 409 PRICE_CHANGED, as a pure function.
 *
 * Its own module, not in cart-context.tsx: a component file that also exports
 * helpers loses React Fast Refresh (same reason as pro-selection.ts).
 */
import type { CartLineItem } from "./cart-context";

/** One line of a 409 PRICE_CHANGED: the pro's live price for a variant. */
export interface CartPriceChange {
  serviceVariantId: string;
  currentPrice: number;
}

/**
 * SVC-411: re-price the lines a 409 PRICE_CHANGED named, at the pro's live
 * price. Pure, so the cart can book the repriced lines in the same tap as it
 * stores them, without waiting for a re-render.
 */
export function applyPriceChanges(
  items: CartLineItem[],
  changes: CartPriceChange[],
  now: Date = new Date(),
): CartLineItem[] {
  const byVariant = new Map(changes.map((c) => [c.serviceVariantId, c.currentPrice]));
  const quotedAt = now.toISOString();
  return items.map((line) => {
    const price =
      line.spId && line.serviceVariantId ? byVariant.get(line.serviceVariantId) : undefined;
    return price === undefined ? line : { ...line, quotedPrice: price, unitPrice: price, quotedAt };
  });
}
