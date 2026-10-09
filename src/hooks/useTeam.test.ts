import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { assignOutcomeForError, nationalDigits, teamErrorMessage } from "@/hooks/useTeam";

describe("assignOutcomeForError", () => {
  // The status alone mixes booking-level and Pro-level answers, so the code
  // decides first. Getting this wrong either closes a live job's picker or
  // leaves a dead one open.
  it.each([
    [409, "PRO_BUSY", "repick"],
    [409, "PRO_OFFLINE", "repick"],
    // The team Pro's own KYC isn't verified (backend #196).
    [409, "PRO_KYC_INCOMPLETE", "repick"],
    // The Pro was removed while the picker was open; the booking is still live.
    [404, "PRO_NOT_FOUND", "repick"],
    // SVC-326: the SP picked themselves after switching off taking jobs.
    [409, "SELF_NOT_TAKING_JOBS", "repick"],
    [410, undefined, "taken"],
    [403, undefined, "unavailable"],
    // BookingNotFound carries no code.
    [404, undefined, "unavailable"],
    // InvalidStateTransition carries no code: the booking moved on.
    [409, undefined, "unavailable"],
    [500, undefined, null],
  ])("%i %s → %s", (status, code, expected) => {
    expect(assignOutcomeForError(new ApiError(status, "x", undefined, code))).toBe(expected);
  });

  it("treats a network failure as retryable", () => {
    expect(assignOutcomeForError(new TypeError("Failed to fetch"))).toBeNull();
  });
});

describe("teamErrorMessage", () => {
  it("uses friendly copy for known codes, not the server's", () => {
    expect(
      teamErrorMessage(new ApiError(409, "Asha is already on another job.", undefined, "PRO_BUSY")),
    ).toMatch(/another job/);
    expect(
      teamErrorMessage(new ApiError(403, "x", undefined, "INVITER_PAYOUT_KYC_INCOMPLETE")),
    ).toMatch(/KYC/);
  });

  it("explains the SVC-326 refusals", () => {
    expect(teamErrorMessage(new ApiError(409, "x", undefined, "SELF_NOT_TAKING_JOBS"))).toMatch(
      /not taking jobs yourself/,
    );
    // Switching off as a solo SP.
    expect(teamErrorMessage(new ApiError(409, "x", undefined, "NO_TEAM_TO_DISPATCH"))).toMatch(
      /add someone to your team/i,
    );
  });

  it("explains the invite rate limit", () => {
    expect(teamErrorMessage(new ApiError(429, "Too Many Requests"))).toMatch(/hour/);
  });

  it("falls back to the server message", () => {
    expect(teamErrorMessage(new ApiError(400, "must be an Indian mobile number"))).toBe(
      "must be an Indian mobile number",
    );
  });
});

describe("nationalDigits", () => {
  it.each([
    ["98765 43210", "9876543210"],
    ["+91 98765-43210", "9876543210"],
    ["919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    // An 11th typed digit is ignored, not shifted in at the front's expense.
    ["98765432101", "9876543210"],
    ["98765", "98765"],
  ])("%s → %s", (raw, expected) => {
    expect(nationalDigits(raw)).toBe(expected);
  });
});
