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

/** Format a paise integer as Indian-grouped rupees: 2400000 → "₹24,000". */
export function formatPaise(paise: number): string {
  // Whole-rupee amounts (the common case) read better without ".00"; keep the
  // decimals when there genuinely is a paise remainder rather than hiding it.
  return inr(paise % 100 === 0 ? 0 : 2).format(paise / 100);
}
