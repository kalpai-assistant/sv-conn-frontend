/**
 * The Pro app's KYC message (SVC-322). An unverified Pro gets no jobs, and this
 * is the only thing on screen saying why — so each state must say something,
 * and say the right thing.
 */
import { describe, expect, it } from "vitest";
import { proKycCopy } from "@/lib/pro-kyc";

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
