import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, formatPaise, formatRupees, formatTime } from "./format";

const DEVANAGARI_DIGIT = /[०-९]/;
const at = new Date(2026, 9, 18, 14, 30);

describe("formatter (SVC-375)", () => {
  it("keeps money Indian-grouped in every language", () => {
    // mr-IN in ICU groups the Western way (₹125,000); en-IN everywhere avoids it.
    for (const lang of ["en", "hi", "mr"] as const) {
      expect(formatRupees(125000, lang)).toBe("₹1,25,000");
      expect(formatPaise(2400050, lang)).toBe("₹24,000.50");
      expect(formatNumber(125000, lang)).toBe("1,25,000");
    }
  });

  it("prints Latin digits in hi and mr dates and times", () => {
    for (const lang of ["hi", "mr"] as const) {
      const date = formatDate(at, { day: "numeric", month: "short" }, lang);
      const time = formatTime(at, { hour: "numeric", minute: "2-digit" }, lang);
      expect(date).not.toMatch(DEVANAGARI_DIGIT);
      expect(time).not.toMatch(DEVANAGARI_DIGIT);
      expect(date).toContain("18");
      expect(time).toContain("2:30");
    }
  });

  it("names the month in the language", () => {
    expect(formatDate(at, { month: "short" }, "mr")).not.toMatch(/Oct/);
    expect(formatDate(at, { month: "short" }, "hi")).not.toMatch(/Oct/);
  });

  it("leaves English dates in the device locale, as before", () => {
    const options = { day: "numeric", month: "short" } as const;
    expect(formatDate(at, options)).toBe(at.toLocaleDateString(undefined, options));
  });
});
