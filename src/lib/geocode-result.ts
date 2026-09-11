/**
 * Telling a place from a failure to name one (SVC-283).
 *
 * `MapPicker` reports the address under its pin through `onLocationSelected`,
 * and when the reverse geocode fails it reports a sentence instead —
 * "Unknown Location", or "Could not fetch address". Those strings are fine to
 * *show*; the danger is that they are also long enough to satisfy the
 * backend's `min_length=5`, so a caller that stores what it is handed saves
 * the failure as the address. That is the same class of bug as the coordinate
 * strings this ticket removes: text describing our failure, persisted as
 * though it described a place.
 *
 * Lives here rather than beside the picker so that both the picker and the
 * callers that must recognise these values can share one definition, without a
 * component module having to export non-components.
 */

/** No `display_name` came back, but the request itself succeeded. */
export const GEOCODE_UNKNOWN = "Unknown Location";
/** The request failed outright — offline, rate-limited, blocked. */
export const GEOCODE_FAILED = "Could not fetch address";

/** True when an address string names a failure rather than a place. */
export function isGeocodeFailure(address: string): boolean {
  const trimmed = address.trim();
  return trimmed === "" || trimmed === GEOCODE_UNKNOWN || trimmed === GEOCODE_FAILED;
}

/** A six-digit Indian PIN code as its own comma-separated part. */
const PIN_PART = /^\d{6}$/;

/**
 * Drop the PIN code from a geocoded address (SVC-283).
 *
 * ## Why, when a PIN code is normally useful
 *
 * Because OpenStreetMap's is wrong here, and a wrong PIN code is worse than
 * none. Measured on device: a pin on Lane Number 1, Kharadi — correct street,
 * correct suburb, correct coordinates — comes back as 411001 at every zoom
 * level from 16 to 19. Kharadi is 411014; 411001 is Pune GPO, about 8km away.
 * Nominatim is resolving the postcode against the municipal boundary rather
 * than the locality, so there is no request we can make that fixes it.
 *
 * Removing it costs nothing functional. Dispatch matches a booking to
 * providers on coordinates — PostGIS distance between the address point and
 * `service_area_center` — never on text, and nothing in this app parses a PIN
 * code out of an address. `localityFrom` already discards it when naming a
 * row. The one place it genuinely reaches a human is the address a provider
 * reads on their way to a job, which is exactly where being wrong by 8km
 * matters and being absent does not: the street, locality and city are all
 * still there, and all of them are right.
 *
 * Only the six-digit part is dropped. The rest of the address is left exactly
 * as the geocoder wrote it — this trims a known-bad field, it does not
 * reformat addresses.
 */
export function withoutPinCode(address: string): string {
  const parts = address.split(",");
  const kept = parts.filter((part) => !PIN_PART.test(part.trim()));
  // If every part looked like a PIN code there is nothing meaningful left, so
  // keep the original rather than returning an empty string.
  return kept.length > 0 ? kept.join(",").trim() : address;
}
