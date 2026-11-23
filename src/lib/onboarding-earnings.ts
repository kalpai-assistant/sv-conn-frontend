/**
 * Earnings range shown on provider onboarding step 0 (SVC-490).
 *
 * The step-0 "What you'll earn" hero needs a credible range to show new
 * providers before they commit to KYC. The honest shape is per-service
 * per-city — "AC Repair providers in Bangalore earn ₹30,000–₹45,000/month on
 * average" — but that data lives downstream of SVC-406 (Tushar's pricing
 * epic). Until that lands, this module returns a city-generic placeholder
 * marked `confidence: "placeholder"` so the UI can be honest about what it
 * is.
 *
 * When SVC-495 unblocks (pricing corpus exposes per-service/per-city
 * ranges), the only change is `useOnboardingEarnings` swaps its placeholder
 * return for a React Query call against the new endpoint. The call-site
 * shape stays the same — step 0 doesn't change.
 *
 * `confidence: "placeholder"` is the signal the hero uses to prefix the copy
 * with "Typical" instead of a specific service name — the number is a
 * ballpark, not a promise.
 */

export type EarningsConfidence = "high" | "low" | "placeholder";

export interface OnboardingEarningsRange {
  /** Monthly low, in rupees (not paise — this surface never deals in paise). */
  low: number;
  /** Monthly high, in rupees. */
  high: number;
  confidence: EarningsConfidence;
}

// Placeholder range until SVC-495 wires real data. Chosen as the 25th/75th
// percentile of informal-sector service-provider monthly earnings in Tier-1
// Indian cities (NSSO 2022–23, informal workers in services). Deliberately
// broad because the real variance by service IS this wide — plumbers in
// Bangalore vs cleaners in Pune are genuinely different numbers.
const PLACEHOLDER_RANGE: OnboardingEarningsRange = {
  low: 8000,
  high: 25000,
  confidence: "placeholder",
};

/**
 * Returns the earnings range to show on step 0. Today, always the
 * placeholder; once SVC-495 lands, this reads from a React Query hook
 * against the pricing endpoint.
 */
export function useOnboardingEarnings(): OnboardingEarningsRange {
  return PLACEHOLDER_RANGE;
}

/** Non-hook access for tests + the rare caller that needs it sync. */
export function getOnboardingEarningsPlaceholder(): OnboardingEarningsRange {
  return PLACEHOLDER_RANGE;
}
