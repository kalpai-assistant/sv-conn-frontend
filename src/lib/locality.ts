/**
 * The recognisable place-name inside a full address (SVC-281, SVC-284).
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
 * ## Two shapes, one goal
 *
 * A fresh reverse geocode returns structured `address_components`, and the
 * right choice is there under a known type — `sublocality_level_1` for Indian
 * addresses. `localityFromComponents` reads it directly. Under Nominatim the
 * equivalent was `address.suburb`; under Google Maps (SVC-284) it is a typed
 * component, but the idea is the same: stop guessing at the flattened line.
 *
 * A saved address, though, is only a composed string — the structured columns
 * behind it were added by SVC-287, and everything written before that has
 * none. `localityFrom` stays for those rows, because the string is all we
 * have and Karve Nagar still works. It does still overshoot for Kharadi-shaped
 * strings (see the test), but a fresh geocode never routes through it any
 * more; it exists only for the legacy stored rows.
 */

/** How many leading parts are street-level rather than area-level. */
const STREET_PARTS = 2;

/**
 * Draw the locality out of a comma-separated address string.
 *
 * Used on saved addresses, where the only source of a locality is what was
 * once written into `full_address`. Fresh reverse geocodes call
 * `localityFromComponents` — that path reads structured fields rather than
 * counting commas.
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

/**
 * Pick the recognisable place-name out of Google's structured components
 * (SVC-284).
 *
 * Google returns `address_components: [{ long_name, short_name, types: [] }]`.
 * Each component carries the *type* of thing it is — a suburb, a locality, a
 * country — which is what lets this function ask for the right level of place
 * by name rather than by position in a string.
 *
 * For an Indian address `sublocality_level_1` is almost always the
 * neighbourhood a resident would recognise ("Kharadi", "Karve Nagar",
 * "Koramangala"). `neighborhood` appears on some responses in the US-y sense.
 * `locality` is the city — the last resort before the label, because a row
 * reading "Pune" is only useful when the user has no other Pune addresses
 * saved. `administrative_area_level_2` catches the very rare case where even
 * the city is missing and we are down to the district.
 */
export function localityFromComponents(
  components: google.maps.GeocoderAddressComponent[],
  fallbackLabel: string,
): string {
  const byType = (type: string): string | undefined => {
    const found = components.find((c) => c.types.includes(type as never));
    const value = found?.long_name?.trim();
    return value && value.length > 0 ? value : undefined;
  };

  return (
    byType("sublocality_level_1") ??
    byType("sublocality") ??
    byType("neighborhood") ??
    byType("locality") ??
    byType("administrative_area_level_2") ??
    fallbackLabel
  );
}
