/**
 * Monogram for a photo-less avatar (SVC-273).
 *
 * The common path, not an edge case: consumers have no photo field at all, and
 * a provider's is null whenever the onboarding upload is skipped.
 */
import { describe, expect, it } from "vitest";
import { initialsFrom } from "@/lib/initials";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsFrom("Ravi Kumar")).toBe("RK");
  });

  it("handles a single name", () => {
    expect(initialsFrom("Ravi")).toBe("R");
  });

  it("ignores everything past the second word", () => {
    expect(initialsFrom("Ravi Shankar Kumar Sharma")).toBe("RS");
  });

  it("survives the messy whitespace real names arrive with", () => {
    expect(initialsFrom("  ravi   kumar  ")).toBe("RK");
  });

  it("gives up on a name with no letters", () => {
    // A phone number saved as a name would otherwise render as "93" in a
    // circle, which reads as data rather than a person. Returning null lets
    // the caller fall back to a glyph instead.
    expect(initialsFrom("9322398902")).toBeNull();
    expect(initialsFrom("")).toBeNull();
    expect(initialsFrom(null)).toBeNull();
    expect(initialsFrom(undefined)).toBeNull();
  });
});
