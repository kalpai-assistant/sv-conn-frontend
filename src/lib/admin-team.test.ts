/**
 * SVC-329 refusal copy and audit sentences. Every backend refusal code from
 * #202 has its own line; an admin must never see a raw code or a 409.
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import type { API_AdminActionRow, API_AdminProviderRow, API_AdminTeamPro } from "@/hooks/useApi";
import {
  ACTIVE_JOB_COPY,
  describeAction,
  forceRemoveErrorCopy,
  activeJobLink,
  reasonError,
  reassignErrorCopy,
  reassignTargetBlock,
} from "@/lib/admin-team";

const apiErr = (status: number, code?: string) =>
  new ApiError(status, "server text", undefined, code);

describe("reasonError", () => {
  it("requires at least 3 non-space characters, like the backend", () => {
    expect(reasonError("")).toMatch(/required/);
    expect(reasonError("  ab  ")).toMatch(/required/);
    expect(reasonError("abc")).toBeNull();
  });
});

describe("forceRemoveErrorCopy", () => {
  it("maps every force-remove refusal", () => {
    expect(forceRemoveErrorCopy(apiErr(409, "PRO_HAS_ACTIVE_JOB"))).toBe(ACTIVE_JOB_COPY);
    expect(forceRemoveErrorCopy(apiErr(404, "PRO_NOT_FOUND"))).toMatch(/already removed/);
    expect(forceRemoveErrorCopy(apiErr(400, "CANNOT_REMOVE_SELF"))).toMatch(/owner's own profile/);
  });

  it("reads a 422 as the reason length, and falls back to the server's message", () => {
    expect(forceRemoveErrorCopy(apiErr(422))).toMatch(/3–500 characters/);
    expect(forceRemoveErrorCopy(apiErr(500))).toBe("server text");
  });

  it("links an active-job refusal to the first blocking booking (#203)", () => {
    const err = new ApiError(409, "raw", undefined, "PRO_HAS_ACTIVE_JOB", {
      booking_ids: ["b-1", "b-2"],
    });
    expect(activeJobLink(err)).toEqual({ bookingId: "b-1" });
  });

  it("falls back to the bookings list when no ids came back", () => {
    expect(activeJobLink(apiErr(409, "PRO_HAS_ACTIVE_JOB"))).toEqual({ bookingId: null });
    expect(
      activeJobLink(new ApiError(409, "raw", undefined, "PRO_HAS_ACTIVE_JOB", { booking_ids: [] })),
    ).toEqual({ bookingId: null });
  });

  it("offers no booking link for any other refusal", () => {
    expect(activeJobLink(apiErr(409, "ALREADY_ON_TEAM"))).toBeNull();
    expect(activeJobLink(new Error("network"))).toBeNull();
  });
});

describe("reassignErrorCopy", () => {
  it.each([
    ["PRO_NOT_FOUND", /already removed or moved/],
    ["CANNOT_REASSIGN_SELF", /owner's own profile/],
    ["SAME_SERVICE_PROVIDER", /already on that owner's team/],
    ["TARGET_SP_NOT_FOUND", /no longer exists/],
    ["TARGET_SP_INACTIVE", /deactivated. Pick a different owner/],
    ["TARGET_SP_KYC_INCOMPLETE", /hasn't completed KYC/],
    ["USER_INACTIVE", /person's account is deactivated/],
    ["ALREADY_ON_TEAM", /already an active member/],
    ["PRO_HAS_ACTIVE_JOB", /Has an active job/],
  ])("maps %s", (code, copy) => {
    const text = reassignErrorCopy(apiErr(409, code));
    expect(text).toMatch(copy);
    expect(text).not.toContain(code);
  });
});

const owner = (o: Partial<API_AdminProviderRow> = {}): API_AdminProviderRow => ({
  user_id: "sp-2",
  name: "Ravi",
  phone: "+919876500002",
  business_name: "Ravi Services",
  kyc_status: "verified",
  is_online: false,
  user_is_active: true,
  active_pro_count: 0,
  created_at: "2026-10-01T00:00:00Z",
  ...o,
});

describe("reassignTargetBlock", () => {
  it("lets a verified, active, different owner be picked", () => {
    expect(reassignTargetBlock(owner(), "sp-1")).toBeNull();
  });

  it("blocks the current owner, a deactivated one and an unverified one", () => {
    expect(reassignTargetBlock(owner({ user_id: "sp-1" }), "sp-1")).toBe("Current team");
    expect(reassignTargetBlock(owner({ user_is_active: false }), "sp-1")).toBe("Deactivated");
    expect(reassignTargetBlock(owner({ kyc_status: "submitted" }), "sp-1")).toBe(
      "KYC not verified",
    );
  });
});

const pro = (p: Partial<API_AdminTeamPro> = {}): API_AdminTeamPro => ({
  id: "pro-1",
  service_provider_id: "sp-1",
  user_id: "u-1",
  display_name: "Asha K.",
  phone: "+919876500007",
  user_is_active: true,
  profile_photo_url: null,
  kyc_status: "verified",
  is_online: false,
  is_active: false,
  is_self: false,
  accepts_direct_jobs: true,
  active_job_count: 0,
  created_at: "2026-10-01T00:00:00Z",
  ...p,
});

const action = (a: Partial<API_AdminActionRow>): API_AdminActionRow => ({
  id: "a-1",
  admin_user_id: "admin-1",
  admin_name: "Vipul",
  action: "pro_force_removed",
  target_type: "professional",
  target_id: "pro-1",
  sp_user_id: "sp-1",
  to_sp_user_id: null,
  reason: "Left",
  details: {},
  created_at: "2026-10-10T00:00:00Z",
  ...a,
});

describe("describeAction", () => {
  it("names a force-removed member and notes the self re-enable", () => {
    const d = describeAction(action({ details: { self_reenabled: true } }), "sp-1", [pro()]);
    expect(d.summary).toBe("Asha K. was force-removed from the team");
    expect(d.notes).toContain("The owner was switched back to taking jobs themselves.");
  });

  it("tells a move away from a move in, and links the other owner", () => {
    const row = action({
      action: "pro_reassigned",
      to_sp_user_id: "sp-2",
      details: { to_professional_id: "pro-9", reactivated: false, kyc_status: "pending" },
    });
    const away = describeAction(row, "sp-1", [pro()]);
    expect(away.summary).toBe("Asha K. was moved to another team");
    expect(away.otherOwnerId).toBe("sp-2");
    expect(away.notes).toContain("Started KYC pending on the new team.");

    const into = describeAction(row, "sp-2", [pro({ id: "pro-9", service_provider_id: "sp-2" })]);
    expect(into.summary).toBe("Asha K. was moved here from another team");
    expect(into.otherOwnerId).toBe("sp-1");
  });

  it("says a reactivated row kept its own KYC", () => {
    const d = describeAction(
      action({ action: "pro_reassigned", details: { reactivated: true, kyc_status: "verified" } }),
      "sp-1",
      [],
    );
    expect(d.notes[0]).toMatch(/keeping its own KYC \(KYC verified\)/);
  });

  it("describes a deactivation of the owner", () => {
    const d = describeAction(
      action({ action: "user_deactivated", target_type: "user", target_id: "sp-1" }),
      "sp-1",
      [],
    );
    expect(d.summary).toBe("The owner's account was deactivated");
  });
});
