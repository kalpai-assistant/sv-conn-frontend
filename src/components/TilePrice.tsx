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
import { useFromPrices, type API_ServiceFromPrice } from "@/hooks/useApi";
import { useTilePoint } from "@/hooks/useTilePoint";
import { formatRupees } from "@/lib/currency";
import type { Service } from "@/lib/mock-data";

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
  const point = useTilePoint();
  const { data } = useFromPrices(point);
  const row = data?.find((r) => r.service_id === service.id);
  const state = tilePriceState(row, service.price);

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
