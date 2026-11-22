/**
 * One service tile's state at the customer's point: the point (useTilePoint),
 * that point's from-prices row, and what the tile says (tilePriceState).
 *
 * TilePrice paints it, SVC-419's tap event reports it and SVC-484's Notify me
 * appears on it, all through this hook, so none of them can disagree with the
 * label the customer sees. `point` is the unrounded tile point; useFromPrices
 * (and the alert PUT) round it with the same `round4`.
 */
import { useFromPrices } from "@/hooks/useApi";
import { useTilePoint, type TilePoint } from "@/hooks/useTilePoint";
import { tilePriceState, type TilePriceState } from "@/lib/tile-price-state";
import type { Service } from "@/lib/mock-data";

export interface TileState {
  point: TilePoint | null;
  state: TilePriceState;
}

export function useTileState(service: Pick<Service, "id" | "price">): TileState {
  const point = useTilePoint();
  const { data } = useFromPrices(point);
  const row = data?.find((r) => r.service_id === service.id);
  return { point, state: tilePriceState(row, service.price) };
}
