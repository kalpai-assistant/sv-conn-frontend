import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { errorText } from "./errors";

describe("errorText (SVC-375)", () => {
  const coded = new ApiError(
    409,
    "Remove your team members before deleting your account.",
    undefined,
    "TEAM_HAS_PROS",
  );

  it("leaves English exactly as before: the backend's message, or the fallback", () => {
    expect(errorText(coded, "fallback")).toBe(
      "Remove your team members before deleting your account.",
    );
    expect(errorText(new TypeError("Failed to fetch"), "fallback")).toBe("Failed to fetch");
    expect(errorText("weird", "fallback")).toBe("fallback");
  });

  it("translates a known code in hi", () => {
    expect(errorText(coded, "x", "hi")).toBe(
      "अकाउंट डिलीट करने से पहले अपनी टीम के सदस्यों को हटाएँ।",
    );
  });

  it("falls back to the backend's English for an uncoded or unknown code", () => {
    expect(errorText(new ApiError(400, "Bad thing"), "x", "hi")).toBe("Bad thing");
    expect(errorText(new ApiError(400, "Odd", undefined, "NEW_CODE"), "x", "hi")).toBe("Odd");
  });

  it("never shows a raw browser string in hi", () => {
    expect(errorText(new TypeError("Failed to fetch"), "फिर से कोशिश करें", "hi")).toBe(
      "फिर से कोशिश करें",
    );
  });
});
