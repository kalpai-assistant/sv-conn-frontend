/**
 * Naming the place on each saved-location row (SVC-281).
 *
 * The gate's protection rests entirely on a row being falsifiable. A row
 * reading "Home" is true wherever the user is standing, so someone who moved
 * from Pune to Mumbai taps it and picks a Pune address — the exact failure the
 * gate exists to catch. Found on device, when the rows rendered the address
 * *label* rather than the place.
 */
import { describe, expect, it } from "vitest";
import { localityFrom, localityFromParts } from "@/lib/locality";

const PUNE =
  "Lane Number 7, Mavale vasti, Karve Nagar, Anandnagar, Pune City Subdistrict, Pune District, Maharashtra, 411051, India";

/**
 * Kharadi, as Nominatim actually returns it (SVC-284).
 *
 * One fewer street-level part than the Karve Nagar string above — there is no
 * `neighbourhood` — so every part shifts left by one. That is the whole bug.
 */
const KHARADI =
  "Lane Number 1, Kharadi, Pune, Pune City Subdistrict, Pune, Maharashtra, 411001, India";

describe("a full Nominatim address", () => {
  it("picks the neighbourhood, not the street", () => {
    // Specific enough to be wrong in another city, familiar enough to recognise.
    expect(localityFrom(PUNE, "Home")).toBe("Karve Nagar");
  });

  it("never falls back to the label when a place is available", () => {
    // The bug: "Home" is a category, true everywhere, and confirms nothing.
    expect(localityFrom(PUNE, "Home")).not.toBe("Home");
  });
});

describe("shorter addresses", () => {
  it("uses the broadest part it has", () => {
    expect(localityFrom("Flat 3, MG Road, Bangalore", "Work")).toBe("Bangalore");
  });

  it("still yields something for a two-part address", () => {
    expect(localityFrom("221B Baker Street, London", "Home")).toBe("London");
  });
});

describe("noise", () => {
  it("ignores postcodes and the country", () => {
    // Neither identifies a neighbourhood, and "411051" on a button is useless.
    const result = localityFrom("A, B, 411051, India", "Home");
    expect(result).not.toBe("411051");
    expect(result).not.toBe("India");
  });
});

describe("nothing usable", () => {
  it("falls back to the label rather than rendering blank", () => {
    expect(localityFrom("", "Home")).toBe("Home");
  });
});

describe("counting commas gets it wrong (SVC-284)", () => {
  it("overshoots to the city when a part is missing", () => {
    // Documents the flaw rather than asserting it is acceptable. Kharadi has no
    // `neighbourhood`, so the fixed index lands one part too far and names the
    // city. Both saved addresses are in Pune, so a row reading "Pune" tells the
    // user exactly as little as "Home" — the failure the locality exists to
    // prevent. Unfixable from the flattened string: nothing in it marks which
    // part is the suburb.
    expect(localityFrom(KHARADI, "Home")).toBe("Pune");
  });
});

describe("the structured address, when we have it", () => {
  // Nominatim returns these alongside `display_name` on every response we
  // already make — both call sites send `addressdetails=1` and discarded them.
  // Measured against the live API for the two addresses in SVC-284.

  it("names the suburb, which is what the string parse missed", () => {
    expect(
      localityFromParts({ road: "Lane Number 1", suburb: "Kharadi", city: "Pune" }, "Home"),
    ).toBe("Kharadi");
  });

  it("agrees with the string parse where the string parse was right", () => {
    // Karve Nagar was correct by luck of its shape. The structured read must
    // not change it — a fix that moves a working row is not a fix.
    expect(
      localityFromParts(
        {
          road: "Lane Number 7",
          neighbourhood: "Mavale vasti",
          suburb: "Karve Nagar",
          city: "Pune",
        },
        "Home",
      ),
    ).toBe("Karve Nagar");
  });

  it("prefers the suburb over the neighbourhood", () => {
    // "Mavale vasti" is a lane cluster — too fine to recognise and too easily
    // true in two cities. The suburb is the level people name themselves by.
    expect(
      localityFromParts({ neighbourhood: "Mavale vasti", suburb: "Karve Nagar" }, "Home"),
    ).toBe("Karve Nagar");
  });

  it("falls through to broader fields when the suburb is absent", () => {
    expect(localityFromParts({ town: "Anandnagar", city: "Pune" }, "Home")).toBe("Anandnagar");
    expect(localityFromParts({ city: "Pune" }, "Home")).toBe("Pune");
  });

  it("falls back to the label when the object is empty or missing", () => {
    // Cached rows, a rate-limited response, or a geocoder that answered with
    // coordinates and nothing else.
    expect(localityFromParts({}, "Home")).toBe("Home");
    expect(localityFromParts(undefined, "Home")).toBe("Home");
  });

  it("ignores blank strings rather than rendering an empty row", () => {
    expect(localityFromParts({ suburb: "   ", city: "Pune" }, "Home")).toBe("Pune");
  });
});
