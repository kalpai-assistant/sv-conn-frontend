/**
 * Google Maps SDK access (SVC-284).
 *
 * One loader for the whole app: every reverse geocode, autocomplete query and
 * place-details lookup goes through this module. That keeps a single Google
 * Maps script tag in the page and the API key in one place, and it lets
 * callers stay declarative — `reverseGeocode(lat, lng)` reads the same in a
 * component as in a hook.
 *
 * ## What replaced Nominatim, and why
 *
 * OpenStreetMap's reverse geocoder returned wrong PIN codes for Pune
 * localities — Kharadi came back as 411001 (Pune GPO, ~8km away) at every
 * zoom, because Nominatim resolves the postcode against the municipal
 * boundary rather than the locality. See SVC-284's ticket for the measured
 * device output.
 *
 * Google's `Geocoder` returns structured `address_components`, which is what
 * fixes the second half of that ticket too: `localityFromComponents` reads
 * `sublocality_level_1` directly instead of parsing a comma-separated string
 * at a fixed index and drawing "Pune" for a Kharadi address.
 *
 * ## Cost shape
 *
 * Reverse geocoding is billed per call (a few thousand a day fits inside the
 * free credit at beta scale). Autocomplete is billed *per session* — one bill
 * covers every keystroke plus the final place-details lookup, provided the
 * same `AutocompleteSessionToken` is passed to both. `createAutocompleteSession`
 * returns a fresh token; callers hold it from the first keystroke to the pick
 * and then discard it.
 *
 * ## Failure mode
 *
 * The SDK loads asynchronously the first time it is needed. A missing key
 * (empty `VITE_GOOGLE_MAPS_BROWSER_API_KEY`) throws before the network call,
 * and every exported function surfaces that as a thrown error rather than a
 * silent `null` — the caller is the right layer to decide whether to fall
 * back to a "move the pin" prompt or a toast.
 *
 * ## Loader API note
 *
 * v2 of `@googlemaps/js-api-loader` deprecated the `new Loader().load()` shape
 * in favour of `setOptions()` + `importLibrary()`. The old class is still in
 * the package for back-compat but its type declaration no longer includes
 * `.load()`, so this module uses the modern API — one `setOptions` on first
 * touch, then per-call `importLibrary`. Both share the same underlying script
 * tag; there is no duplicate load.
 */

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_API_KEY as string | undefined;

let configured = false;

function configureOnce(): void {
  if (configured) return;
  if (!API_KEY) {
    throw new Error("VITE_GOOGLE_MAPS_BROWSER_API_KEY is not set — see .env.example");
  }
  setOptions({
    key: API_KEY,
    v: "weekly",
    libraries: ["places", "geocoding"],
  });
  configured = true;
}

export interface ReverseGeocodeResult {
  /** The one-line address Google would show on a marker's info window. */
  formattedAddress: string;
  /** Structured parts, in whatever order Google returns them. */
  components: google.maps.GeocoderAddressComponent[];
}

/**
 * Turn `(lat, lng)` into the address Google puts there.
 *
 * Returns `null` when Google has no result for the point (mid-ocean, an
 * unmapped area). Throws on network failure or a missing key — the caller
 * decides whether that is a "move the pin" state or a toast.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  configureOnce();
  const { Geocoder } = await importLibrary("geocoding");
  const geocoder = new Geocoder();
  const { results } = await geocoder.geocode({ location: { lat, lng } });
  const first = results?.[0];
  if (!first) return null;
  return {
    formattedAddress: first.formatted_address,
    components: first.address_components,
  };
}

export interface PlacePrediction {
  placeId: string;
  /** Big line — usually the place name or street. */
  primaryText: string;
  /** Small line under it — usually the city/state. */
  secondaryText: string;
}

/**
 * Open a billing session.
 *
 * The token is passed to every `queryPlaces` call and to the final
 * `placeDetails` lookup. Google prices that whole chain as one autocomplete
 * session; without a session token each `getPlacePredictions` call is billed
 * separately. Discarded after a successful pick — start a new session for the
 * next search.
 */
export async function createAutocompleteSession(): Promise<google.maps.places.AutocompleteSessionToken> {
  configureOnce();
  const { AutocompleteSessionToken } = await importLibrary("places");
  return new AutocompleteSessionToken();
}

/**
 * Suggestions for what the user is typing.
 *
 * India-restricted (`country: "in"`) because Eazyserv only operates here —
 * "Bangalore" should not offer Bangalore, USA and Bengaluru together, and
 * unrestricted results include both.
 */
export async function queryPlaces(
  input: string,
  sessionToken: google.maps.places.AutocompleteSessionToken,
): Promise<PlacePrediction[]> {
  const trimmed = input.trim();
  if (!trimmed) return [];
  configureOnce();
  const { AutocompleteService } = await importLibrary("places");
  const svc = new AutocompleteService();
  const { predictions } = await svc.getPlacePredictions({
    input: trimmed,
    sessionToken,
    componentRestrictions: { country: "in" },
  });
  return predictions.map((p) => ({
    placeId: p.place_id,
    primaryText: p.structured_formatting.main_text,
    secondaryText: p.structured_formatting.secondary_text ?? "",
  }));
}

export interface PlaceDetails {
  lat: number;
  lng: number;
  formattedAddress: string;
  components: google.maps.GeocoderAddressComponent[];
}

// `PlacesService` needs a DOM node for its attribution overlay, even when the
// caller is not drawing a map. A single detached div is enough and avoids
// leaking one per call.
let detailsAttribution: HTMLDivElement | null = null;

/**
 * Resolve a `placeId` into a location and address components.
 *
 * Requires the same `sessionToken` that produced the prediction — dropping it
 * costs a separate autocomplete-charge per pick.
 */
export async function placeDetails(
  placeId: string,
  sessionToken: google.maps.places.AutocompleteSessionToken,
): Promise<PlaceDetails | null> {
  configureOnce();
  const { PlacesService, PlacesServiceStatus } = await importLibrary("places");
  detailsAttribution ??= document.createElement("div");
  const svc = new PlacesService(detailsAttribution);
  return new Promise((resolve) => {
    svc.getDetails(
      {
        placeId,
        sessionToken,
        fields: ["geometry", "formatted_address", "address_components"],
      },
      (place, status) => {
        if (status !== PlacesServiceStatus.OK || !place?.geometry?.location) {
          resolve(null);
          return;
        }
        resolve({
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          formattedAddress: place.formatted_address ?? "",
          components: place.address_components ?? [],
        });
      },
    );
  });
}
