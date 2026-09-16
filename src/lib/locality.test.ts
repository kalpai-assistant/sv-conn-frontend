/**
 * Naming the place on each saved-location row (SVC-281, SVC-284).
 *
 * The gate's protection rests entirely on a row being falsifiable. A row
 * reading "Home" is true wherever the user is standing, so someone who moved
 * from Pune to Mumbai taps it and picks a Pune address — the exact failure the
 * gate exists to catch. Found on device, when the rows rendered the address
 * *label* rather than the place.
 */
import { describe, expect, it } from "vitest";
import { localityFrom, localityFromComponents } from "@/lib/locality";

const PUNE =
  "Lane Number 7, Mavale vasti, Karve Nagar, Anandnagar, Pune City Subdistrict, Pune District, Maharashtra, 411051, India";

/**
 * Kharadi, as the flattened string used to arrive from the geocoder (SVC-284).
 *
 * One fewer street-level part than the Karve Nagar string above — the index
 * overshoots. Kept as a regression witness: fresh geocodes now read structured
 * components (see `localityFromComponents`), but every saved row from before
 * SVC-287 is still only a string, and that path still misfires on this shape.
 */
const KHARADI_STRING =
  "Lane Number 1, Kharadi, Pune, Pune City Subdistrict, Pune, Maharashtra, 411001, India";

/** Build a Google `GeocoderAddressComponent` from a `{ type: long_name }` map. */
function components(entries: Record<string, string>): google.maps.GeocoderAddressComponent[] {
  return Object.entries(entries).map(([type, long_name]) => ({
    long_name,
    short_name: long_name,
    types: [type],
  })) as google.maps.GeocoderAddressComponent[];
}

describe("a full address string, for saved rows only", () => {
  it("picks the neighbourhood, not the street", () => {
    // Specific enough to be wrong in another city, familiar enough to recognise.
    expect(localityFrom(PUNE, "Home")).toBe("Karve Nagar");
  });

  it("never falls back to the label when a place is available", () => {
    // The bug: "Home" is a category, true everywhere, and confirms nothing.
    expect(localityFrom(PUNE, "Home")).not.toBe("Home");
  });
});

describe("shorter address strings", () => {
  it("uses the broadest part it has", () => {
    expect(localityFrom("Flat 3, MG Road, Bangalore", "Work")).toBe("Bangalore");
  });

  it("still yields something for a two-part address", () => {
    expect(localityFrom("221B Baker Street, London", "Home")).toBe("London");
  });
});

describe("noise in the address string", () => {
  it("ignores postcodes and the country", () => {
    // Neither identifies a neighbourhood, and "411051" on a button is useless.
    const result = localityFrom("A, B, 411051, India", "Home");
    expect(result).not.toBe("411051");
    expect(result).not.toBe("India");
  });
});

describe("nothing usable in the string", () => {
  it("falls back to the label rather than rendering blank", () => {
    expect(localityFrom("", "Home")).toBe("Home");
  });
});

describe("counting commas gets it wrong (SVC-284)", () => {
  it("overshoots to the city when a part is missing", () => {
    // Documents the flaw rather than asserting it is acceptable. Kharadi has no
    // neighbourhood-level component, so the fixed index lands one part too far
    // and names the city. Unfixable from the flattened string — nothing in it
    // marks which part is the suburb. Fresh geocodes route through
    // localityFromComponents instead; this remains only for saved rows.
    expect(localityFrom(KHARADI_STRING, "Home")).toBe("Pune");
  });
});

describe("Google's structured components (SVC-284)", () => {
  it("prefers the sublocality — 'Kharadi' for a Kharadi pin", () => {
    // The whole point of moving off the string parse: sublocality_level_1 is
    // the neighbourhood a resident would recognise, and Google marks it
    // directly rather than leaving us to count commas.
    expect(
      localityFromComponents(
        components({
          route: "Lane Number 1",
          sublocality_level_1: "Kharadi",
          locality: "Pune",
          country: "India",
        }),
        "Home",
      ),
    ).toBe("Kharadi");
  });

  it("agrees with the old string parse where the old parse was right", () => {
    // Karve Nagar was correct by luck of its shape. A fix that moves a working
    // row is not a fix — the sublocality reads exactly the same name.
    expect(
      localityFromComponents(
        components({
          route: "Lane Number 7",
          sublocality_level_2: "Mavale vasti",
          sublocality_level_1: "Karve Nagar",
          locality: "Pune",
        }),
        "Home",
      ),
    ).toBe("Karve Nagar");
  });

  it("falls through to broader types when the sublocality is absent", () => {
    // Some geocoder answers skip sublocality — treat neighborhood as the next
    // useful level, then locality, then the district.
    expect(
      localityFromComponents(
        components({ neighborhood: "Indiranagar", locality: "Bangalore" }),
        "Home",
      ),
    ).toBe("Indiranagar");

    expect(localityFromComponents(components({ locality: "Pune" }), "Home")).toBe("Pune");

    expect(
      localityFromComponents(components({ administrative_area_level_2: "Pune District" }), "Home"),
    ).toBe("Pune District");
  });

  it("falls back to the label when the array is empty", () => {
    // A geocoder answer with no address components — rare, but treat it as
    // "no name" and let the caller withhold the row.
    expect(localityFromComponents([], "Home")).toBe("Home");
  });

  it("ignores blank strings rather than rendering an empty row", () => {
    expect(
      localityFromComponents(components({ sublocality_level_1: "   ", locality: "Pune" }), "Home"),
    ).toBe("Pune");
  });
});
