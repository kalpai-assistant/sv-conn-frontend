/**
 * What a service tile says (SVC-415), as data. Lives outside TilePrice.tsx so
 * the hooks that read it (useTileState, used by TilePrice itself, SVC-419's
 * tap event and SVC-484's Notify me) don't import a component that imports
 * them back. TilePrice re-exports all of it.
 */
import type { API_ServiceFromPrice } from "@/hooks/useApi";

export type TilePriceState =
  { kind: "price"; amount: number } | { kind: "offline" } | { kind: "coming-soon" };

/** The label for one service, from its from-prices row (undefined = no data). */
export function tilePriceState(
  row: API_ServiceFromPrice | undefined,
  cataloguePrice: number,
): TilePriceState {
  if (!row) return { kind: "price", amount: Math.floor(cataloguePrice) };
  if (row.from_price != null) return { kind: "price", amount: Math.floor(row.from_price) };
  return row.served ? { kind: "offline" } : { kind: "coming-soon" };
}

export const TILE_OFFLINE_TEXT = "No pros online right now";
export const TILE_COMING_SOON_TEXT = "Coming soon";

/** SVC-484's Notify me labels (Vipul's words for the enabled state). */
export const NOTIFY_ME_TEXT = "Notify me";
export const NOTIFY_ME_ENABLED_TEXT = "Notify me enabled — tap to cancel";

/**
 * One option row on the service sheet (SVC-496), from the SAME from-prices row
 * as the header (useTileState), so the header and the rows can't come from two
 * responses.
 *
 * - no row (no point yet, loading, the request failed, an inactive service),
 *   or a row without this variant → its catalogue price, as before, never
 *   greyed: the header falls back to the catalogue in the same case;
 * - a price → "from ₹X" (floored, like the tile), flagged when it is the
 *   variant's out-of-range fallback;
 * - null → nobody listable prices this option: greyed, not selectable.
 *
 * The header is never derived from these: it reads the service from_price,
 * which prefers any in-range variant over a cheaper out-of-range one.
 */
export type VariantPriceState =
  | { kind: "catalogue"; amount: number }
  | { kind: "price"; amount: number; outsideRange: boolean }
  | { kind: "no-pros" };

export function variantPriceState(
  row: API_ServiceFromPrice | undefined,
  variantId: string,
  cataloguePrice: number,
): VariantPriceState {
  const entry = row?.variants.find((v) => v.variant_id === variantId);
  if (!entry) return { kind: "catalogue", amount: cataloguePrice };
  if (entry.from_price == null) return { kind: "no-pros" };
  return {
    kind: "price",
    amount: Math.floor(entry.from_price),
    outsideRange: entry.outside_recommended_range,
  };
}

export const isVariantSelectable = (state: VariantPriceState) => state.kind !== "no-pros";

/**
 * The option the sheet treats as chosen: the customer's pick while it is
 * still selectable, else the first selectable option, else the first option
 * (every option greyed: the header already says Coming soon / No pros online,
 * and Choose pro behaves as before). Re-run on every render, so a greyed
 * first option stops being the default the moment from-prices arrives.
 */
export function defaultVariantId(
  variants: readonly { id: string; price: number }[],
  selectedId: string | undefined,
  row: API_ServiceFromPrice | undefined,
): string | undefined {
  const selectable = (v: { id: string; price: number }) =>
    isVariantSelectable(variantPriceState(row, v.id, v.price));
  const picked = variants.find((v) => v.id === selectedId);
  if (picked && selectable(picked)) return picked.id;
  return (variants.find(selectable) ?? variants[0])?.id;
}

/** SVC-496 row copy (Tushar, 2026-11-22). */
export const VARIANT_OUT_OF_RANGE_TEXT = "Outside our recommended range";
export const VARIANT_NO_PROS_TEXT = "No pros";
