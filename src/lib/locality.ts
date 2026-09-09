/**
 * The recognisable place-name inside a full address (SVC-281).
 *
 * The location gate's rows have to name *where* each saved place is, and the
 * address label does not: "Home" is a category. Someone who moved from Pune to
 * Mumbai reads a row saying "Home" and taps it, because they are at home —
 * their Mumbai home. That picks a Pune address, and the booking finds no
 * providers, which is the exact failure the gate exists to prevent.
 *
 * A locality does the job: a row reading "Karve Nagar" is visibly wrong in
 * Mumbai, where "Home" is not.
 *
 * Nominatim returns a comma-separated string ordered narrowest-first, e.g.
 *   "Lane Number 7, Mavale vasti, Karve Nagar, Anandnagar, Pune City
 *    Subdistrict, Pune District, Maharashtra, 411051, India"
 *
 * The third part is usually the neighbourhood — specific enough to be wrong in
 * another city, familiar enough to be recognised. Falling back through the
 * available parts keeps something meaningful for shorter addresses, and the
 * label is the last resort rather than the default.
 */

/** How many leading parts are street-level rather than area-level. */
const STREET_PARTS = 2;

export function localityFrom(fullAddress: string, fallbackLabel: string): string {
  const parts = fullAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    // Postcodes and country names identify no neighbourhood.
    .filter((p) => !/^\d{5,6}$/.test(p) && p.toLowerCase() !== "india");

  // Prefer the first area-level part; fall back to progressively broader ones,
  // then to whatever exists, then to the label.
  return parts[STREET_PARTS] ?? parts[parts.length - 1] ?? fallbackLabel;
}
