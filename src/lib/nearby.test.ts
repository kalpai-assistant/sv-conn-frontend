/**
 * Deciding whether two saved places are the same place (SVC-283).
 *
 * This replaced a text-only dedupe, and the reason matters for what is tested
 * here: once "use my current location" reverse-geocodes, two visits to one
 * building no longer produce the same string. Proximity has to carry the rule,
 * and text is only the tiebreak that still catches the legacy coordinate rows.
 */
import { describe, expect, it } from "vitest";
import { dedupeByPlace, metresBetween, SAME_PLACE_METRES } from "@/lib/nearby";

/** Karve Nagar, Pune — the address the device duplicates were found at. */
const KARVE_NAGAR = { lat: 18.4854, lng: 73.8177 };

/**
 * A point `metres` north of `from`.
 *
 * North rather than east so the conversion is a constant: a degree of latitude
 * is ~111.32km everywhere, while a degree of longitude shrinks with latitude.
 */
const northOf = (from: { lat: number; lng: number }, metres: number) => ({
  lat: from.lat + metres / 111_320,
  lng: from.lng,
});

describe("measuring distance", () => {
  it("is zero for a point and itself", () => {
    expect(metresBetween(KARVE_NAGAR, KARVE_NAGAR)).toBe(0);
  });

  it("agrees with a known real-world distance", () => {
    // Pune to Mumbai, ~120km apart. A flat-earth approximation or a radius
    // typo would still pass the small-distance tests above; this is the one
    // that catches it.
    const pune = { lat: 18.5204, lng: 73.8567 };
    const mumbai = { lat: 19.076, lng: 72.8777 };

    expect(metresBetween(pune, mumbai) / 1000).toBeCloseTo(119, -1);
  });

  it("is symmetric", () => {
    const other = northOf(KARVE_NAGAR, 500);

    expect(metresBetween(KARVE_NAGAR, other)).toBeCloseTo(metresBetween(other, KARVE_NAGAR), 6);
  });

  it("measures a constructed offset accurately", () => {
    expect(metresBetween(KARVE_NAGAR, northOf(KARVE_NAGAR, 25))).toBeCloseTo(25, 0);
  });
});

describe("the 25m rule", () => {
  it("merges two fixes inside the same building", () => {
    // The device case: two taps of "use my current location" minutes apart,
    // the GPS landing a few metres out, and — now that we geocode — Nominatim
    // naming them differently. Same place, different text.
    const rows = [
      { id: "a1", full: "Lane Number 7, Karve Nagar, Pune", ...KARVE_NAGAR },
      { id: "a2", full: "Mavale vasti, Karve Nagar, Pune", ...northOf(KARVE_NAGAR, 8) },
    ];

    expect(dedupeByPlace(rows).map((r) => r.id)).toEqual(["a1"]);
  });

  it("keeps two places Zepto would render as distinguishable", () => {
    // The reason for 25 rather than the 50 originally proposed: Zepto shows
    // saved-address distances to 0.1km, so merging anything it would print
    // apart takes a real choice off a screen the user cannot get past.
    const rows = [
      { id: "a1", full: "Lane Number 7, Karve Nagar, Pune", ...KARVE_NAGAR },
      { id: "a2", full: "Some other building, Karve Nagar, Pune", ...northOf(KARVE_NAGAR, 40) },
    ];

    expect(dedupeByPlace(rows)).toHaveLength(2);
  });

  it("treats exactly the threshold as the same place", () => {
    // Inclusive, so the boundary has one defined answer rather than depending
    // on floating-point luck.
    const rows = [
      { id: "a1", full: "One", ...KARVE_NAGAR },
      { id: "a2", full: "Two", ...northOf(KARVE_NAGAR, SAME_PLACE_METRES - 0.5) },
    ];

    expect(dedupeByPlace(rows)).toHaveLength(1);
  });

  it("keeps the earlier record when two are merged", () => {
    // The older row is the one the selected-address pointer and any past
    // booking already refer to.
    const rows = [
      { id: "older", full: "First", ...KARVE_NAGAR },
      { id: "newer", full: "Second", ...northOf(KARVE_NAGAR, 5) },
    ];

    expect(dedupeByPlace(rows)[0].id).toBe("older");
  });
});

describe("rows without a usable pin", () => {
  it("still merges identical text", () => {
    // Legacy rows written before SVC-283 — the coordinate-string addresses.
    // Text is what catches these, and it has to keep working.
    const rows = [
      { id: "a1", full: "18.48540, 73.81770" },
      { id: "a2", full: "18.48540, 73.81770" },
    ];

    expect(dedupeByPlace(rows)).toHaveLength(1);
  });

  it("never merges two pin-less addresses by position", () => {
    // Both would decode to 0,0 — the Gulf of Guinea — and measuring that would
    // report them as the same place and delete a real choice.
    const rows = [
      { id: "a1", full: "Karve Nagar, Pune", lat: 0, lng: 0 },
      { id: "a2", full: "Kothrud, Pune", lat: 0, lng: 0 },
    ];

    expect(dedupeByPlace(rows)).toHaveLength(2);
  });

  it("does not merge a pinned address into a pin-less one", () => {
    const rows = [
      { id: "a1", full: "Karve Nagar, Pune" },
      { id: "a2", full: "Kothrud, Pune", ...KARVE_NAGAR },
    ];

    expect(dedupeByPlace(rows)).toHaveLength(2);
  });

  it("ignores a null pin arriving as a non-number", () => {
    const rows = [
      { id: "a1", full: "Karve Nagar, Pune", lat: null as unknown as number, lng: 73.8 },
      { id: "a2", full: "Kothrud, Pune", ...KARVE_NAGAR },
    ];

    expect(dedupeByPlace(rows)).toHaveLength(2);
  });
});

describe("the list itself", () => {
  it("is unchanged when every place is distinct", () => {
    const rows = [
      { id: "a1", full: "Karve Nagar, Pune", ...KARVE_NAGAR },
      { id: "a2", full: "Kothrud, Pune", ...northOf(KARVE_NAGAR, 3_000) },
    ];

    expect(dedupeByPlace(rows)).toHaveLength(2);
  });

  it("handles an empty list", () => {
    expect(dedupeByPlace([])).toEqual([]);
  });
});
