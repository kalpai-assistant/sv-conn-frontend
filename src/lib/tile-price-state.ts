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
