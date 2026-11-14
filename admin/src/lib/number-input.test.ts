import { describe, expect, it } from "vitest";
import { parseMoney, parseWhole } from "./number-input";

describe("parseMoney", () => {
  it("reads rupees, with a stray ₹, comma or space", () => {
    expect(parseMoney("1499")).toEqual({ ok: true, value: 1499 });
    expect(parseMoney("₹1,499.50")).toEqual({ ok: true, value: 1499.5 });
    expect(parseMoney(" 10 00 000 ")).toEqual({ ok: true, value: 1_000_000 });
    expect(parseMoney(".5")).toEqual({ ok: true, value: 0.5 });
  });

  it("reads empty as null", () => {
    expect(parseMoney("")).toEqual({ ok: true, value: null });
    expect(parseMoney("  ")).toEqual({ ok: true, value: null });
  });

  it("refuses what isn't a plain amount", () => {
    expect(parseMoney("abc")).toEqual({ ok: false, error: "Enter a number." });
    expect(parseMoney("-5")).toEqual({ ok: false, error: "Enter a number." });
    expect(parseMoney("1e3")).toEqual({ ok: false, error: "Enter a number." });
    expect(parseMoney("1.")).toEqual({ ok: false, error: "Enter a number." });
  });

  it("refuses more than 2 decimal places", () => {
    expect(parseMoney("1.999")).toEqual({ ok: false, error: "At most 2 decimal places." });
  });

  it("refuses what the money column can't hold", () => {
    expect(parseMoney("10000000000")).toEqual({ ok: false, error: "That's too large." });
    expect(parseMoney("9999999999.99")).toEqual({ ok: true, value: 9_999_999_999.99 });
  });
});

describe("parseWhole", () => {
  it("reads a whole number, with a stray comma or space", () => {
    expect(parseWhole("42")).toEqual({ ok: true, value: 42 });
    expect(parseWhole("1,000")).toEqual({ ok: true, value: 1000 });
    expect(parseWhole("0")).toEqual({ ok: true, value: 0 });
  });

  it("reads empty as null", () => {
    expect(parseWhole("")).toEqual({ ok: true, value: null });
  });

  it("refuses a fraction, a sign or text", () => {
    for (const text of ["1.5", "-1", "+1", "ten"]) {
      expect(parseWhole(text)).toEqual({ ok: false, error: "A whole number." });
    }
  });

  it("refuses what an integer column can't hold", () => {
    expect(parseWhole("2147483647")).toEqual({ ok: true, value: 2_147_483_647 });
    expect(parseWhole("2147483648")).toEqual({ ok: false, error: "That's too large." });
  });
});
