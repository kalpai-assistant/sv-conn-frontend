/**
 * The maths behind the SP's "Market near you" bar (SVC-413), kept pure so it
 * is unit-tested apart from the panel.
 */

/**
 * Where `price` sits on a bar running from `min` (0) to `max` (100), as a
 * percentage for `left:`. All prices equal (max === min) → the middle, 50.
 * Clamped to 0–100: the server always returns min ≤ median, my_price ≤ max,
 * but a marker must never be drawn off the bar if that ever slips.
 */
export function barPosition(price: number, min: number, max: number): number {
  if (max <= min) return 50;
  const pos = ((price - min) / (max - min)) * 100;
  return Math.min(100, Math.max(0, pos));
}

/**
 * Why the SP has no "you" on the bar, from its own row: no price yet, or a
 * price that's switched off. Null when the price is set and on.
 */
export function missingStanding(variant: {
  price_amount: number | null;
  is_active: boolean | null;
}): "unset" | "off" | null {
  if (variant.price_amount === null) return "unset";
  if (variant.is_active !== true) return "off";
  return null;
}
