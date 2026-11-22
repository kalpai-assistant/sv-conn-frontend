/**
 * Helpers for Profile → Service alerts (SVC-484), out of the route file so
 * the route exports only its component.
 */
import type { PanInfo } from "framer-motion";
import type { API_ServiceAlert } from "@/hooks/useServiceAlerts";
import { formatSmart } from "@/lib/date";
import { TILE_COMING_SOON_TEXT, TILE_OFFLINE_TEXT } from "@/lib/tile-price-state";

/** How far left (px) a row must be dragged, or flicked, to remove it. */
export const SWIPE_REMOVE_OFFSET = 80;
const SWIPE_REMOVE_VELOCITY = 500;

/** A drag that ends past the threshold, or a fast flick left, removes. */
export function isSwipeRemove(info: Pick<PanInfo, "offset" | "velocity">): boolean {
  return info.offset.x <= -SWIPE_REMOVE_OFFSET || info.velocity.x <= -SWIPE_REMOVE_VELOCITY;
}

/** The alert's kind in the tile's own wording. */
export function alertKindText(kind: API_ServiceAlert["kind"]): string {
  return kind === "no_pros_online" ? TILE_OFFLINE_TEXT : TILE_COMING_SOON_TEXT;
}

/**
 * "Expires …" for an alert, in formatSmart's wording, lower-cased where it
 * follows "Expires": "Expires 4 Jan", "Expires Mon 3 PM", "Expires tomorrow,
 * 10 AM", "Expires today, 3 PM", "Expires in 12 min". The GET lists open
 * alerts only, so one already past (clock skew) still reads "Expires today"
 * rather than formatSmart's "12 min ago".
 */
export function alertExpiryText(expiresAt: string, now: Date = new Date()): string {
  if (new Date(expiresAt).getTime() <= now.getTime()) return "Expires today";
  const when = formatSmart(expiresAt, { now });
  const lowered =
    when.startsWith("In ") || when.startsWith("Today") || when.startsWith("Tomorrow")
      ? when.charAt(0).toLowerCase() + when.slice(1)
      : when;
  return `Expires ${lowered}`;
}
