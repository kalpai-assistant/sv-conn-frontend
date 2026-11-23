import { afterEach, describe, expect, it, vi } from "vitest";
import { EMAIL_NUDGE_SNOOZE_DAYS, isEmailNudgeSnoozed, snoozeEmailNudge } from "./email-nudge";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-23T06:00:00Z");

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("the email nudge's Not now (SVC-486)", () => {
  it("is 7 days", () => {
    expect(EMAIL_NUDGE_SNOOZE_DAYS).toBe(7);
  });

  it("hides it for 7 days, then it comes back", () => {
    expect(isEmailNudgeSnoozed("u1", NOW)).toBe(false);
    snoozeEmailNudge("u1", NOW);
    expect(isEmailNudgeSnoozed("u1", NOW + 7 * DAY - 1)).toBe(true);
    expect(isEmailNudgeSnoozed("u1", NOW + 7 * DAY)).toBe(false);
  });

  it("is per user", () => {
    snoozeEmailNudge("u1", NOW);
    expect(isEmailNudgeSnoozed("u2", NOW)).toBe(false);
  });

  it("shows the nudge when storage fails, and never throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => snoozeEmailNudge("u1", NOW)).not.toThrow();
    expect(isEmailNudgeSnoozed("u1", NOW)).toBe(false);
  });

  it("ignores a value it can't read", () => {
    window.localStorage.setItem("eazyserv:email-nudge-snoozed-until:u1", "soon");
    expect(isEmailNudgeSnoozed("u1", NOW)).toBe(false);
  });
});
