/**
 * The Pro app's KYC message (SVC-322). An unverified Pro gets no jobs, and this
 * is the only thing on screen saying why — so each state must say something,
 * and say the right thing.
 */
import { describe, expect, it } from "vitest";
import { proKycCopy, proOnlineSwitch } from "@/lib/pro-kyc";

describe("proKycCopy", () => {
  it("says nothing once verified", () => {
    expect(proKycCopy({ kyc_status: "verified", kyc_rejection_reason: null })).toBeNull();
  });

  it("asks a Pro who has not started to verify, and says why it matters", () => {
    const copy = proKycCopy({ kyc_status: "pending", kyc_rejection_reason: null });
    expect(copy?.title).toMatch(/verify your identity/i);
    expect(copy?.detail).toMatch(/can't give you a job/i);
  });

  it("tells a Pro under review that the wait is on us", () => {
    const copy = proKycCopy({ kyc_status: "submitted", kyc_rejection_reason: null });
    expect(copy?.title).toMatch(/being checked/i);
  });

  it("passes the admin's rejection reason through, punctuated once", () => {
    const copy = proKycCopy({ kyc_status: "rejected", kyc_rejection_reason: "Photo is blurry." });
    expect(copy?.detail).toBe("Reason: Photo is blurry. Please submit your documents again.");
  });

  it("still asks for a resubmission when the reason is missing", () => {
    const copy = proKycCopy({ kyc_status: "rejected", kyc_rejection_reason: null });
    expect(copy?.detail).toBe("Please submit your documents again.");
  });
});

describe("proOnlineSwitch", () => {
  it("lets a verified Pro switch either way", () => {
    expect(proOnlineSwitch({ isOnline: false, isVerified: true }).canToggle).toBe(true);
    expect(proOnlineSwitch({ isOnline: true, isVerified: true }).canToggle).toBe(true);
  });

  it("keeps an unverified, offline Pro from going online", () => {
    const sw = proOnlineSwitch({ isOnline: false, isVerified: false });
    expect(sw.canToggle).toBe(false);
    expect(sw.detail).toMatch(/once your identity is verified/);
  });

  it("lets an unverified Pro who is online go offline (found on device)", () => {
    // KYC rejected after going online: the switch sat at "online", greyed out.
    const sw = proOnlineSwitch({ isOnline: true, isVerified: false });
    expect(sw.canToggle).toBe(true);
    expect(sw.detail).toMatch(/can't give you jobs until/);
  });
});
