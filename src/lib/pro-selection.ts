/**
 * Pure helpers for the pro-selection sheet (SVC-416).
 *
 * In their own module, not beside the component: they are plain functions
 * with their own tests, and a component file that also exports helpers loses
 * React Fast Refresh for the whole file.
 */
import type { API_RankedProvider } from "@/hooks/useApi";
import type { CartLineItem } from "@/lib/cart-context";

/**
 * Split the ranked list into the in-range SPs and the ones outside the
 * recommended price range.
 *
 * The backend already orders every in-range SP before every out-of-range one
 * (SVC-482), so the list is split at the first flagged row, not filtered.
 * Filtering would re-sort nothing today, but it would hide a backend that
 * ever interleaved the two. Splitting keeps the server's ranking order
 * exactly as sent, inside each list.
 */
export function splitProviders(providers: API_RankedProvider[]): {
  inRange: API_RankedProvider[];
  outOfRange: API_RankedProvider[];
} {
  const cut = providers.findIndex((p) => p.outside_recommended_range);
  if (cut === -1) return { inRange: providers, outOfRange: [] };
  return { inRange: providers.slice(0, cut), outOfRange: providers.slice(cut) };
}

/**
 * The unit after a row's price: "₹450 / visit".
 *
 * The service owns the unit (admin, SVC-430) and every SP prices in it. No
 * "(min N)": `RankedProvider` carries no min_qty, and quantity stays on the
 * cart stepper (SVC-416 comment 14919, item 2). An unknown unit gets no label
 * rather than a guessed one.
 */
const UNIT_LABELS: Record<string, string> = {
  PER_VISIT: "/ visit",
  PER_SQFT: "/ sq ft",
  PER_HOUR: "/ hour",
  PER_ITEM: "/ item",
};

export function priceUnitLabel(unit: string): string | null {
  return UNIT_LABELS[unit] ?? null;
}

/** `name` is null only when the SP has no name at all. */
export function proDisplayName(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "Service pro";
}

/** At most three "why" chips, as the backend sends them (English, fixed set). */
export const MAX_WHY_CHIPS = 3;

/**
 * Whether picking `spId` for `serviceId` breaks the single-SP cart (SVC-417
 * option B), so the customer must confirm "Replace cart?" first.
 *
 * Only lines carrying a *different* SP conflict. Lines with no SP (added
 * before SVC-416) don't: SVC-417 clears those. The line for the service being
 * picked is skipped too, because the pick replaces it anyway. Re-picking an
 * SP for the cart's only line is a change of mind, not a conflict.
 */
export function hasSpConflict(items: CartLineItem[], serviceId: string, spId: string): boolean {
  return items.some((i) => i.serviceId !== serviceId && !!i.spId && i.spId !== spId);
}
