/**
 * The one rupee formatter in the admin app. Moved here from lib/bookings.ts when
 * the payouts screen (SVC-426) needed it too. The bookings API sends rupees, while
 * the payouts API sends paise with the unit in the field name. formatPaise is the
 * only conversion, so a 100x display bug has one place to hide.
 */

const RUPEES = {
  whole: new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }),
  paise: new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

/** Indian-grouped rupees. Paise show only when there are some: ₹1,499 but ₹1,499.50. */
export function formatRupees(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return (Number.isInteger(rounded) ? RUPEES.whole : RUPEES.paise).format(rounded);
}

/** An amount in paise, as rupees: 149950 → ₹1,499.50, 10000000 → ₹1,00,000. */
export function formatPaise(paise: number): string {
  return formatRupees(Math.round(paise) / 100);
}

const RUPEES_COMPACT = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** Short rupees for a chart axis, in lakh and crore: ₹500, ₹12K, ₹1.2L, ₹2.5Cr. */
export function formatRupeesCompact(amount: number): string {
  return RUPEES_COMPACT.format(amount);
}
