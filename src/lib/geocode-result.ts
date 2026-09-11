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
