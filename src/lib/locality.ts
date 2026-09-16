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

/**
 * Nominatim's structured address, the fields we care about (SVC-284).
 *
 * Every field is optional because which ones come back depends on what OSM
 * holds for that point — the omission of `neighbourhood` for Kharadi is exactly
 * what broke the string parse below.
 */
export interface AddressParts {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  town?: string;
  city_district?: string;
  city?: string;
}

/**
 * Name the place from Nominatim's structured fields rather than by counting
 * commas (SVC-284).
 *
 * The string parse below takes a fixed index, which assumes every address has
 * the same number of street-level parts before the neighbourhood. Measured on
 * two real Pune addresses, it does not:
 *
 *   Lane Number 7, Mavale vasti, Karve Nagar, …   index 2 → "Karve Nagar"  ✓
 *   Lane Number 1, Kharadi, Pune, …               index 2 → "Pune"         ✗
 *
 * Kharadi has no `neighbourhood`, so everything shifts left and the index
 * overshoots into the city. A row reading "Pune" is as useless as one reading
 * "Home" when both saved addresses are in Pune — the failure this whole module
 * exists to prevent.
 *
 * Nothing in the flattened string marks which part is the suburb, so no smarter
 * parse can fix it. The structured object does mark it, and we were already
 * receiving one: both call sites send `addressdetails=1` and read only
 * `display_name`.
 *
 * Ordered narrowest-first, starting at `suburb` rather than `neighbourhood`:
 * "Mavale vasti" is a lane cluster, too fine to be recognised and too easily
 * true in two cities. The suburb is the level people name themselves by.
 */
export function localityFromParts(parts: AddressParts | undefined, fallbackLabel: string): string {
  const named = [
    parts?.suburb,
    parts?.neighbourhood,
    parts?.village,
    parts?.town,
    parts?.city_district,
    parts?.city,
  ].find((value) => typeof value === "string" && value.trim().length > 0);

  return named?.trim() ?? fallbackLabel;
}

/** How many leading parts are street-level rather than area-level. */
const STREET_PARTS = 2;

/**
 * Name the place from a flattened address string.
 *
 * Superseded by `localityFromParts` wherever the structured object is in hand,
 * but not removed: saved addresses are stored as a single `full_address` string
 * and the components were never persisted, so every row already in the database
 * can only be named this way. It is the fallback, not the preferred path — see
 * the note on `localityFromParts` for the shape it gets wrong.
 */
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
