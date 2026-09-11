/**
 * Whether two saved places are the same place (SVC-283).
 *
 * ## Why text is not enough any more
 *
 * The gate used to dedupe its rows by address text, and that worked only
 * because every "use my current location" wrote the *same* synthetic string —
 * the coordinates, rounded to five places. Two taps in one spot produced two
 * byte-identical rows, so comparing text caught them.
 *
 * Once the coordinates are reverse-geocoded that stops being true. Nominatim
 * answers the same building differently depending on the metre the fix landed
 * on: "Lane Number 7, Karve Nagar…" one time, "Mavale vasti, Karve Nagar…" the
 * next. Same place, different text, two rows — the duplicate the user saw on
 * device, back again and now invisible to a string comparison.
 *
 * So proximity is the question, and text is only a tiebreak.
 *
 * ## Why 25 metres
 *
 * Measured against what the reference apps consider distinguishable rather than
 * picked for roundness. Zepto renders saved-address distances to 0.1 km
 * (`Home • 14.1 km`), so anything it is willing to show apart, we should not
 * merge — and 50m, the number originally proposed here, sits right at that
 * boundary.
 *
 * 25m is half of it: comfortably inside one building, comfortably outside the
 * jitter between two coarse fixes taken minutes apart, and well under the
 * resolution at which any of these apps distinguish two addresses.
 *
 * Erring small is also the safer direction. Merging two rows that are genuinely
 * different removes the right answer from a screen the user cannot get past;
 * showing one row too many only costs a glance.
 */

/** Two fixes within this distance are treated as the same place. */
export const SAME_PLACE_METRES = 25;

const EARTH_RADIUS_M = 6_371_000;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

export interface Point {
  lat: number;
  lng: number;
}

/**
 * A record that may or may not carry a pin.
 *
 * `null` is not defensive padding — it is what `AddressResponse` actually
 * returns for an address saved before coordinates were stored, and those rows
 * are exactly the ones `hasNoPin` has to keep out of the distance comparison.
 */
export type MaybePoint = { lat?: number | null; lng?: number | null };

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than a flat-earth approximation: the cost is one extra
 * trig call on a list that is never longer than a handful of addresses, and it
 * stays correct at any latitude instead of only near the equator.
 */
export function metresBetween(a: Point, b: Point): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * True when a pin is missing or is the null island.
 *
 * 0,0 is in the Gulf of Guinea and is what an address with no stored point
 * decodes to if anything coerces null to a number. Treating it as a real
 * position would put every pin-less address 8,000km from the user and, worse,
 * cluster them all together as "the same place" — so they are excluded from
 * proximity entirely and fall through to the text comparison.
 */
function hasNoPin(item: MaybePoint): boolean {
  const { lat, lng } = item;
  if (typeof lat !== "number" || typeof lng !== "number") return true;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return true;
  return lat === 0 && lng === 0;
}

/**
 * One entry per distinct place, earliest kept.
 *
 * The first record wins because it is the older one, and therefore the one
 * anything else — a previous booking, the selected-address pointer — already
 * refers to.
 *
 * Deliberately not deduping by *label*: two different addresses both called
 * "Home" are two real choices, and hiding one would silently take away the
 * right answer.
 */
export function dedupeByPlace<T extends { full: string } & MaybePoint>(items: T[]): T[] {
  const kept: T[] = [];

  for (const item of items) {
    const isDuplicate = kept.some((seen) => {
      // Same text is the same place regardless of pins — this is what still
      // catches the legacy coordinate-string rows written before SVC-283.
      if (seen.full.trim().toLowerCase() === item.full.trim().toLowerCase()) return true;

      // Without two real pins there is nothing to measure, and guessing would
      // merge unrelated addresses.
      if (hasNoPin(seen) || hasNoPin(item)) return false;

      return metresBetween(seen as Point, item as Point) <= SAME_PLACE_METRES;
    });

    if (!isDuplicate) kept.push(item);
  }

  return kept;
}
