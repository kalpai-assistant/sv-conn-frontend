/**
 * Number inputs as typed. Moved out of lib/coupons.ts (SVC-429) when the catalog
 * forms (SVC-430) needed the same rules. The inputs are text, so a stray ₹, comma
 * or space is fine and every message is ours, not the browser's.
 */

// Mirrors the backend's numeric(12, 2) money columns and a Postgres integer.
const MONEY_LIMIT = 10_000_000_000;
const INT_MAX = 2_147_483_647;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** A rupee amount: a stray ₹, comma or space is fine. Empty is null. */
export function parseMoney(text: string): Parsed<number | null> {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (cleaned === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return { ok: false, error: "Enter a number." };
  if (/\.\d{3,}$/.test(cleaned)) return { ok: false, error: "At most 2 decimal places." };
  const value = Number(cleaned);
  if (value >= MONEY_LIMIT) return { ok: false, error: "That's too large." };
  return { ok: true, value };
}

/** A whole number. Empty is null. */
export function parseWhole(text: string): Parsed<number | null> {
  const cleaned = text.replace(/[,\s]/g, "");
  if (cleaned === "") return { ok: true, value: null };
  if (!/^\d+$/.test(cleaned)) return { ok: false, error: "A whole number." };
  const value = Number(cleaned);
  return value > INT_MAX ? { ok: false, error: "That's too large." } : { ok: true, value };
}
