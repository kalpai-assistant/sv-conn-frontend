// Money helpers. The consumer-facing screens deal in whole rupees (`₹{amount}`),
// but the payout APIs speak paise — ₹24,000 arrives as 2400000. Rendering that
// raw shows ₹24,00,000 in a dialog that moves real money, so every paise-denominated
// figure must go through `formatPaise`.

const inr = (minimumFractionDigits: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits,
    maximumFractionDigits: 2,
  });

/** Options for `formatRupees`. */
export interface FormatRupeesOptions {
  /**
   * Include the `₹` symbol. Defaults to `true`.
   *
   * Opt out when a surface composes its own prefix — e.g. a discount line
   * that renders `(−₹100)` as a parenthesised negative, where the standalone
   * negative output `-₹100` doesn't fit the visual pattern. Callers that opt
   * out still route through `formatRupees` so Indian grouping and the
   * fractional-padding rule below stay centralised.
   */
  withSymbol?: boolean;
}

/** Format a paise integer as Indian-grouped rupees: 2400000 → "₹24,000". */
export function formatPaise(paise: number): string {
  // Whole-rupee amounts (the common case) read better without ".00"; keep the
  // decimals when there genuinely is a paise remainder rather than hiding it.
  return inr(paise % 100 === 0 ? 0 : 2).format(paise / 100);
}

/**
 * Format a rupee amount that is already in rupees: 1499 → "₹1,499".
 *
 * The booking/offer APIs return `service_amount` as a plain rupee number (the
 * backend deliberately does not format it), unlike the payout APIs which speak
 * paise — hence two helpers rather than one. Passing paise here renders a
 * figure 100× too large, so check the field's unit before choosing.
 *
 * Grouping is `en-IN` and that matters: Indian grouping is ₹10,00,000 where the
 * default/US grouping gives ₹1,000,000. The two are identical below ₹1,00,000,
 * which is exactly why the wrong one survives review by eye.
 *
 * Fractional amounts pad to two places (`₹598.40`); whole amounts render clean
 * (`₹499`, not `₹499.00`) — SVC-297 settled this against the live catalogue.
 */
export function formatRupees(rupees: number, options?: FormatRupeesOptions): string {
  const fmt = inr(Number.isInteger(rupees) ? 0 : 2);
  if (options?.withSymbol === false) {
    // Drop the `currency` part and any adjacent literal separator. Node 22
    // full-ICU emits `₹1,00,000` with no gap; older ICU may insert a
    // non-breaking space between symbol and digits. Filtering by part type
    // survives both, where a slice-after-₹ would leave a dangling NBSP.
    return fmt
      .formatToParts(rupees)
      .filter((p) => p.type !== "currency" && p.type !== "literal")
      .map((p) => p.value)
      .join("");
  }
  return fmt.format(rupees);
}
