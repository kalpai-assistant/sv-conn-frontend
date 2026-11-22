/**
 * The price label on a service tile (SVC-415, Jira comments 14939 + 14943).
 *
 * One component for all five places a service shows a price (ServiceCard,
 * ServiceCardCompact, SearchSheet, BookAgainRow, the ServiceSheet header), so
 * they cannot drift apart. Each place keeps its own size and colour through
 * the class props.
 *
 * - `from_price` set → "from ₹X", rounded DOWN to whole rupees, so the label
 *   is never above a real price (₹1,874.25 → "from ₹1,874").
 * - null and served → "No pros online right now".
 * - not served → "Coming soon".
 * - no data (no point, loading, the request failed, or the service is missing
 *   from the list, i.e. inactive) → "from" + the catalogue price. Never
 *   "Coming soon" without data.
 *
 * `service.price` stays the catalogue price everywhere else (cart, coupons);
 * this only changes what the label says.
 */
import { useTileState } from "@/hooks/useTileState";
import { formatRupees } from "@/lib/currency";
import type { Service } from "@/lib/mock-data";
import { TILE_COMING_SOON_TEXT, TILE_OFFLINE_TEXT } from "@/lib/tile-price-state";

// The state itself lives in lib/tile-price-state.ts (no import cycle with the
// hooks that read it); re-exported so every caller keeps importing it here.
export {
  tilePriceState,
  TILE_COMING_SOON_TEXT,
  TILE_OFFLINE_TEXT,
  type TilePriceState,
} from "@/lib/tile-price-state";

interface TilePriceProps {
  service: Pick<Service, "id" | "price">;
  /** The wrapper: layout only (e.g. stacked vs inline). */
  className?: string;
  /** The "from" word. */
  labelClassName?: string;
  /** The amount. */
  priceClassName?: string;
  /** "No pros online right now" / "Coming soon". Defaults to `labelClassName`. */
  statusClassName?: string;
  /**
   * SVC-485: render only one half, so a place can put the price and the
   * status in different spots (ServiceCard). "price" renders only the price
   * state, catalogue fallback included; "status" only offline / coming soon.
   * Null otherwise. Omitted = both, as before. Same cached query either way.
   */
  show?: "price" | "status";
}

export function TilePrice({
  service,
  className,
  labelClassName,
  priceClassName,
  statusClassName,
  show,
}: TilePriceProps) {
  const { state } = useTileState(service);

  if (show === "price" && state.kind !== "price") return null;
  if (show === "status" && state.kind === "price") return null;

  if (state.kind !== "price") {
    return (
      <span className={className} data-tile-price={state.kind}>
        <span className={statusClassName ?? labelClassName}>
          {state.kind === "offline" ? TILE_OFFLINE_TEXT : TILE_COMING_SOON_TEXT}
        </span>
      </span>
    );
  }
  return (
    <span className={className} data-tile-price="price">
      <span className={labelClassName}>from</span>{" "}
      <span className={priceClassName}>{formatRupees(state.amount)}</span>
    </span>
  );
}
