/**
 * Naming the place on the confirm button (SVC-281).
 *
 * The gate's protection rests entirely on the button being falsifiable. "Yes,
 * I'm at home" is true wherever the user is standing, so someone who moved from
 * Pune to Mumbai taps it and confirms a Pune address — the exact failure the
 * gate exists to catch. Found on device: the button rendered the address
 * *label*, not the place.
 */
import { describe, expect, it } from "vitest";
import { localityFrom } from "@/lib/locality";

const PUNE =
  "Lane Number 7, Mavale vasti, Karve Nagar, Anandnagar, Pune City Subdistrict, Pune District, Maharashtra, 411051, India";

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
