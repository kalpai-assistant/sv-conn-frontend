/**
 * Joining a team with an invite code (SVC-322 part 3): the clipboard pre-fill,
 * the copy for every refusal accept-invite can give, and remembering the
 * invite across signup.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  clearPendingInvite,
  hasPendingInvite,
  inviteCodeFromClipboard,
  inviteErrorMessage,
  isAlreadyOnThisTeam,
  rememberPendingInvite,
  syncPendingInvite,
} from "@/lib/invite";

describe("inviteCodeFromClipboard", () => {
  it("takes exactly six digits, trimmed", () => {
    expect(inviteCodeFromClipboard("004217")).toBe("004217");
    expect(inviteCodeFromClipboard("  482913\n")).toBe("482913");
  });

  it("ignores anything else on the clipboard", () => {
    expect(inviteCodeFromClipboard("12345")).toBeNull();
    expect(inviteCodeFromClipboard("1234567")).toBeNull();
    expect(inviteCodeFromClipboard("Your code is 482913")).toBeNull();
    expect(inviteCodeFromClipboard("+919876500006")).toBeNull();
    expect(inviteCodeFromClipboard("")).toBeNull();
    expect(inviteCodeFromClipboard(null)).toBeNull();
    // Whatever a WebView hands back that isn't text.
    expect(inviteCodeFromClipboard({})).toBeNull();
    expect(inviteCodeFromClipboard(482913)).toBeNull();
  });
});

describe("inviteErrorMessage", () => {
  it("a wrong code (or someone else's) points back at the SMS", () => {
    const msg = inviteErrorMessage(new ApiError(404, "x", undefined, "INVITE_NOT_FOUND"));
    expect(msg).toMatch(/isn’t right/);
    expect(msg).toMatch(/number it was sent to/);
  });

  it.each(["expired", "revoked", "accepted"])(
    "a %s invite shows the backend's own sentence, which names which",
    (state) => {
      const sentence = `This invite is ${state}. Ask for a new one if you still want to join.`;
      expect(
        inviteErrorMessage(new ApiError(410, sentence, undefined, "INVITE_NO_LONGER_VALID")),
      ).toBe(sentence);
    },
  );

  it("being on another team explains the one-team rule", () => {
    expect(inviteErrorMessage(new ApiError(400, "x", undefined, "ALREADY_PRO_ELSEWHERE"))).toMatch(
      /one at a time/,
    );
  });

  it("the rate limit says how long to wait", () => {
    expect(inviteErrorMessage(new ApiError(429, "x", 1500))).toBe(
      "Too many tries. Try again in 25 minutes.",
    );
    expect(inviteErrorMessage(new ApiError(429, "x", 30))).toBe(
      "Too many tries. Try again in 1 minute.",
    );
    expect(inviteErrorMessage(new ApiError(429, "x"))).toMatch(/in a while/);
  });

  it("a dropped connection is not blamed on the code", () => {
    expect(inviteErrorMessage(new TypeError("Failed to fetch"))).toMatch(/connection/);
  });
});

describe("isAlreadyOnThisTeam", () => {
  it("treats 409 ALREADY_ON_TEAM as joined, and nothing else", () => {
    expect(isAlreadyOnThisTeam(new ApiError(409, "x", undefined, "ALREADY_ON_TEAM"))).toBe(true);
    expect(isAlreadyOnThisTeam(new ApiError(400, "x", undefined, "ALREADY_PRO_ELSEWHERE"))).toBe(
      false,
    );
  });
});

describe("the pending invite", () => {
  beforeEach(() => sessionStorage.clear());

  it("is remembered until cleared", () => {
    expect(hasPendingInvite()).toBe(false);
    rememberPendingInvite();
    expect(hasPendingInvite()).toBe(true);
    clearPendingInvite();
    expect(hasPendingInvite()).toBe(false);
  });

  describe("kept in step with the route", () => {
    it("is remembered on /invite, signed in or out", () => {
      syncPendingInvite({ onInviteRoute: true, signedOut: true });
      expect(hasPendingInvite()).toBe(true);
      clearPendingInvite();
      syncPendingInvite({ onInviteRoute: true, signedOut: false });
      expect(hasPendingInvite()).toBe(true);
    });

    it("is dropped on the ordinary sign-in screen — backing out of /invite", () => {
      syncPendingInvite({ onInviteRoute: true, signedOut: true });
      syncPendingInvite({ onInviteRoute: false, signedOut: true });
      expect(hasPendingInvite()).toBe(false);
    });

    it("survives a new invitee being sent from /invite to Profile for their name", () => {
      syncPendingInvite({ onInviteRoute: true, signedOut: true });
      // Signed in on /invite, then redirected to /profile.
      syncPendingInvite({ onInviteRoute: true, signedOut: false });
      syncPendingInvite({ onInviteRoute: false, signedOut: false });
      expect(hasPendingInvite()).toBe(true);
    });

    it("is never kept for an SP owner, even on /invite (SVC-354, found on device)", () => {
      // An owner can't join a team, so there is nothing to come back for. Set
      // here rather than only on /invite's owner screen: signing in on /invite
      // re-runs this sync *after* that screen's effect, and re-set the flag.
      rememberPendingInvite();
      syncPendingInvite({ onInviteRoute: true, signedOut: false, provider: true });
      expect(hasPendingInvite()).toBe(false);
    });

    it("is dropped on logout, so the next signup on the phone starts clean", () => {
      syncPendingInvite({ onInviteRoute: true, signedOut: false });
      syncPendingInvite({ onInviteRoute: false, signedOut: false });
      syncPendingInvite({ onInviteRoute: false, signedOut: true });
      expect(hasPendingInvite()).toBe(false);
    });
  });
});
