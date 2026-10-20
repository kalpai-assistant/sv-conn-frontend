import { beforeEach, describe, expect, it } from "vitest";
import { markLanguageAsked, resetLanguagePrompt, shouldAskLanguage } from "@/i18n/language";

const fresh = { id: "u1", i18n_enabled: true, preferred_language: null };

beforeEach(() => resetLanguagePrompt());

describe("shouldAskLanguage (SVC-375)", () => {
  it("asks on provider and Pro screens when nothing was chosen", () => {
    for (const path of ["/pro", "/pro/jobs", "/provider", "/provider/profile"]) {
      expect(shouldAskLanguage(path, fresh), path).toBe(true);
    }
  });

  it("never asks on customer routes or sign-in", () => {
    for (const path of ["/", "/profile", "/bookings", "/invite"]) {
      expect(shouldAskLanguage(path, fresh), path).toBe(false);
    }
    expect(shouldAskLanguage("/pro", null)).toBe(false);
  });

  it("waits until the SP is past onboarding", () => {
    expect(shouldAskLanguage("/provider/onboarding", fresh)).toBe(false);
    expect(shouldAskLanguage("/provider", fresh)).toBe(true);
  });

  it("asks once per sign-in, and again after logout re-arms it", () => {
    markLanguageAsked("u1");
    expect(shouldAskLanguage("/pro", fresh)).toBe(false);
    // Someone else signing in on the same phone is a fresh sign-in.
    expect(shouldAskLanguage("/pro", { ...fresh, id: "u2" })).toBe(true);
    resetLanguagePrompt();
    expect(shouldAskLanguage("/pro", fresh)).toBe(true);
  });

  it("never asks while the kill switch is off, or once a language is saved", () => {
    expect(shouldAskLanguage("/pro", { ...fresh, i18n_enabled: false })).toBe(false);
    expect(shouldAskLanguage("/pro", { id: "u1", preferred_language: null })).toBe(false);
    expect(shouldAskLanguage("/pro", { ...fresh, preferred_language: "en" })).toBe(false);
  });
});
