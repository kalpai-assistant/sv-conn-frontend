/**
 * The language gate (SVC-375). The invariant: Hindi/Marathi appear only on
 * provider and Pro routes, and only while the backend's kill switch is on for
 * this user. Everything else is English, whatever was chosen.
 */
import { afterEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { clearSession } from "@/lib/session";
import {
  activeLanguage,
  getStoredLanguage,
  resetStoredLanguageForTests,
  setStoredLanguage,
  syncStoredLanguage,
} from "./language";
import { LANGUAGES } from "./languages";

const TRANSLATED = [
  "/pro",
  "/pro/jobs",
  "/pro/jobs/b1",
  "/pro/kyc",
  "/provider",
  "/provider/profile",
];
const ENGLISH_ONLY = [
  "/",
  "/profile",
  "/bookings",
  "/cart",
  "/activity",
  "/invite",
  "/tracking/b1",
  "/admin/kyc",
  // Prefix look-alikes the route helpers must not match.
  "/profile/edit",
  "/providers",
  "/process",
];

afterEach(() => resetStoredLanguageForTests());

describe("activeLanguage", () => {
  it("is English on every route while i18n_enabled is false, whatever is chosen", () => {
    for (const enabled of [false, undefined]) {
      for (const pathname of [...TRANSLATED, ...ENGLISH_ONLY]) {
        for (const lang of LANGUAGES) {
          const user = { i18n_enabled: enabled, preferred_language: lang };
          expect(activeLanguage({ pathname, user, stored: lang })).toBe("en");
        }
      }
    }
  });

  it("is English on customer routes and sign-in even while enabled", () => {
    const user = { i18n_enabled: true, preferred_language: "hi" as const };
    for (const pathname of ENGLISH_ONLY) {
      expect(activeLanguage({ pathname, user, stored: "mr" }), pathname).toBe("en");
    }
    // Signed out — the sign-in screen renders on whatever path was opened.
    for (const pathname of [...TRANSLATED, ...ENGLISH_ONLY]) {
      expect(activeLanguage({ pathname, user: null, stored: "hi" })).toBe("en");
    }
  });

  it("uses the chosen language only on /pro* and /provider* while enabled", () => {
    for (const pathname of TRANSLATED) {
      expect(
        activeLanguage({
          pathname,
          user: { i18n_enabled: true, preferred_language: "hi" },
          stored: null,
        }),
      ).toBe("hi");
      expect(
        activeLanguage({
          pathname,
          user: { i18n_enabled: true, preferred_language: null },
          stored: "mr",
        }),
      ).toBe("mr");
    }
  });

  it("prefers the device's choice over the backend's copy (a save that failed offline)", () => {
    const user = { i18n_enabled: true, preferred_language: "hi" as const };
    expect(activeLanguage({ pathname: "/pro", user, stored: "mr" })).toBe("mr");
  });

  it("is English when enabled but nothing was ever chosen", () => {
    const user = { i18n_enabled: true, preferred_language: null };
    for (const pathname of TRANSLATED) {
      expect(activeLanguage({ pathname, user, stored: null })).toBe("en");
    }
  });
});

describe("stored language", () => {
  it("survives logout's clearSession", () => {
    setStoredLanguage("hi");
    clearSession(new QueryClient());
    expect(window.localStorage.getItem("eazyserv:language")).toBe("hi");
  });

  it("copies the backend's value in, but a null leaves the device's choice", () => {
    syncStoredLanguage({ preferred_language: "mr" });
    expect(getStoredLanguage()).toBe("mr");
    syncStoredLanguage({ preferred_language: null });
    expect(getStoredLanguage()).toBe("mr");
  });
});
