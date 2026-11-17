/**
 * The SP's own price per variant (SVC-412): parsing what the SP types, the
 * recommended-range test, and the live "You receive" preview.
 *
 * Money is handled as whole paise (and the range test in whole micro-rupees),
 * never as float rupees: ₹80.07 has no exact binary form, and a float puts a
 * price that sits exactly on a bound on the wrong side of it.
 *
 * The preview mirrors `commission.take_home` in the backend. It is only ever a
 * preview: once a price is saved, the row shows the server's `take_home`.
 */

/** Numeric(12, 2): at most 10 whole digits. Pydantic's `max_digits=12` alone
 *  would let a 12-digit whole price through to a database overflow. */
const MAX_WHOLE_DIGITS = 10;

// Digits, then optionally a point and one or two more. No sign, no grouping.
const PRICE_SHAPE = /^(\d+)(?:\.(\d{1,2}))?$/;

export type ParsedPrice = { ok: true; paise: number } | { ok: false };

/** What the SP typed → whole paise, or not a price: > 0, at most 2 decimals,
 *  at most 10 whole digits. */
export function parsePrice(text: string): ParsedPrice {
  const match = PRICE_SHAPE.exec(text.trim());
  if (!match) return { ok: false };
  const whole = match[1].replace(/^0+/, "");
  if (whole.length > MAX_WHOLE_DIGITS) return { ok: false };
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const paise = Number(whole || "0") * 100 + Number(fraction);
  return paise > 0 ? { ok: true, paise } : { ok: false };
}

/** Rupees from the API (a float with at most 2 decimals) → whole paise. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** A saved price as the text box shows it: 950 → "950", 950.5 → "950.50". */
export function priceText(rupees: number | null): string {
  if (rupees === null) return "";
  const paise = toPaise(rupees);
  const whole = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, "0")}`;
}

/** Half up, as `ROUND_HALF_UP` in `app/utils/money.py` (amounts are never
 *  negative). Snapping to 12 significant digits first stops float noise —
 *  12.4999999999 for an exact 12.5 — from rounding down. */
function roundHalfUp(value: number): number {
  return Math.floor(Number(value.toPrecision(12)) + 0.5);
}

export interface TakeHomePaise {
  commission: number;
  gst: number;
  receives: number;
}

/** `commission.take_home` in paise: the commission at the variant's own
 *  percent, the GST on that rounded commission, and the rest to the SP. */
export function previewTakeHome(
  pricePaise: number,
  commissionPct: number,
  gstPct: number,
): TakeHomePaise {
  const commission = roundHalfUp((pricePaise * commissionPct) / 100);
  const gst = roundHalfUp((commission * gstPct) / 100);
  return { commission, gst, receives: pricePaise - commission - gst };
}

export interface PriceRange {
  low: number;
  high: number;
}

// The bounds are base_price × (1 ∓ bounds_pct / 100): two 2-dp numbers over
// 100, so never more than 6 decimals. Whole micro-rupees hold them exactly.
const toMicro = (rupees: number) => Math.round(rupees * 1_000_000);

/** `price_range.is_outside_range`: below `low` or above `high`, against the
 *  exact bounds (both in range). No range → never outside. */
export function isOutsideRange(pricePaise: number, range: PriceRange | null): boolean {
  if (range === null) return false;
  const price = pricePaise * 10_000;
  return price < toMicro(range.low) || price > toMicro(range.high);
}

/** The range in whole rupees for display: the low bound rounded up and the
 *  high one down, so every shown price really is inside. */
export function displayRange(range: PriceRange): { low: number; high: number } {
  return {
    low: Math.ceil(toMicro(range.low) / 1_000_000),
    high: Math.floor(toMicro(range.high) / 1_000_000),
  };
}
