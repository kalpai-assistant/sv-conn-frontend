/**
 * Cleaning up what the geocoder hands back (SVC-283).
 */
import { describe, expect, it } from "vitest";
import {
  GEOCODE_FAILED,
  GEOCODE_UNKNOWN,
  addressForDisplay,
  isGeocodeFailure,
  withoutPinCode,
} from "@/lib/geocode-result";

describe("recognising a failure", () => {
  it.each([GEOCODE_UNKNOWN, GEOCODE_FAILED, "", "   "])("treats %o as a failure", (value) => {
    expect(isGeocodeFailure(value)).toBe(true);
  });

  it("treats a real address as a place", () => {
    expect(isGeocodeFailure("Lane Number 1, Kharadi, Pune")).toBe(false);
  });
});

describe("dropping the PIN code", () => {
  it("removes the wrong PIN code OSM returns for Kharadi", () => {
    // Measured on device: this exact string came back for a pin on the right
    // street in Kharadi, which is 411014. 411001 is Pune GPO, ~8km away, and
    // every zoom from 16 to 19 returned it.
    const osm =
      "Lane Number 1, Kharadi, Pune, Pune City Subdistrict, Pune District, Maharashtra, 411001, India";

    expect(withoutPinCode(osm)).toBe(
      "Lane Number 1, Kharadi, Pune, Pune City Subdistrict, Pune District, Maharashtra, India",
    );
  });

  it("leaves an address without one untouched", () => {
    const plain = "Lane Number 1, Kharadi, Pune, Maharashtra, India";

    expect(withoutPinCode(plain)).toBe(plain);
  });

  it("keeps house and lane numbers, which are not PIN codes", () => {
    // The rule is six digits as a whole part. A flat number must survive it —
    // stripping "Flat 302" would damage the one detail a provider needs most.
    const withNumbers = "Flat 302, Lane No 4, Karve Nagar, Pune, 411052, India";

    expect(withoutPinCode(withNumbers)).toBe("Flat 302, Lane No 4, Karve Nagar, Pune, India");
  });

  it("does not strip a six-digit run inside a longer part", () => {
    // "Plot 411014/A" is part of an address, not a PIN code on its own.
    const embedded = "Plot 411014/A, Kharadi, Pune, India";

    expect(withoutPinCode(embedded)).toBe(embedded);
  });

  it("returns the original when there would be nothing left", () => {
    // Degenerate, but returning "" here would hand an empty address to the
    // form and look like a geocode failure when it was not one.
    expect(withoutPinCode("411001")).toBe("411001");
  });
});

describe("showing an address line (SVC-395)", () => {
  it("leaves English exactly as it was", () => {
    expect(addressForDisplay(GEOCODE_FAILED)).toBe("Could not fetch address");
    expect(addressForDisplay(GEOCODE_UNKNOWN, "en")).toBe("Unknown Location");
  });

  it("words the two failures in Hindi and Marathi", () => {
    expect(addressForDisplay(GEOCODE_FAILED, "hi")).toBe("पता नहीं मिल सका");
    expect(addressForDisplay(GEOCODE_UNKNOWN, "hi")).toBe("अनजान जगह");
    expect(addressForDisplay(GEOCODE_FAILED, "mr")).toBe("पत्ता मिळू शकला नाही");
    expect(addressForDisplay(GEOCODE_UNKNOWN, "mr")).toBe("अज्ञात जागा");
  });

  it("never touches a real address", () => {
    const place = "Lane 7, Karvenagar, Pune";
    expect(addressForDisplay(place, "hi")).toBe(place);
  });
});
