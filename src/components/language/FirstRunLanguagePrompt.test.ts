import { beforeEach, describe, expect, it } from "vitest";
import {
  markLanguageAsked,
  markLanguageUnsaved,
  resetLanguagePrompt,
  resetStoredLanguageForTests,
  shouldAskLanguage,
} from "@/i18n/language";

const fresh = { id: "u1", i18n_enabled: true, preferred_language: null };

beforeEach(() => resetStoredLanguageForTests());

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

  it("asks a new SP at the start of onboarding (SVC-376)", () => {
    expect(shouldAskLanguage("/provider/onboarding", fresh)).toBe(true);
    expect(shouldAskLanguage("/provider", fresh)).toBe(true);
  });

  it("asks only once, so finishing onboarding does not ask again", () => {
    expect(shouldAskLanguage("/provider/onboarding", fresh)).toBe(true);
    markLanguageAsked("u1");
    expect(shouldAskLanguage("/provider", fresh)).toBe(false);
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

  it("does not ask again on the start after an offline pick (SVC-395)", () => {
    // Fresh process: nothing asked yet, and the backend still reads null.
    markLanguageUnsaved("u1");
    expect(shouldAskLanguage("/pro", fresh)).toBe(false);
    // Only that account's pick counts: someone else is still asked.
    expect(shouldAskLanguage("/pro", { ...fresh, id: "u2" })).toBe(true);
  });
});
