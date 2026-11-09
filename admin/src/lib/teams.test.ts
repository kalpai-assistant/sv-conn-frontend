import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  activeJobId,
  canEditTeam,
  checkReason,
  describeProAction,
  describeSpAction,
  forceRemoveErrorCopy,
  formatDay,
  formatProRating,
  formatServiceArea,
  formatSpRating,
  hasProFilters,
  hasSpFilters,
  inviteStatusLabel,
  isActionable,
  kycLabel,
  mayHaveMore,
  proActionsPath,
  proJobsPath,
  prosListPath,
  reassignErrorCopy,
  reassignTargetBlock,
  reassignTargetsPath,
  spActionsPath,
  spBookingsSearch,
  spLabel,
  spPayoutSummaryPath,
  spsListPath,
  validateProsSearch,
  validateSpsSearch,
  type AdminAction,
  type SpRow,
  type TeamPro,
} from "@/lib/teams";

const SP_A = "5b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const SP_B = "6c2e3d4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f";
const PRO_OLD = "7d3f4e5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
const PRO_NEW = "8e4a5b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c";
const BOOKING = "9f5b6c7d-8e9f-4a0b-9c2d-3e4f5a6b7c8d";

const params = (path: string) => Object.fromEntries(new URL(path, "http://x").searchParams);

function sp(overrides: Partial<SpRow> = {}): SpRow {
  return {
    user_id: SP_B,
    name: "Vikram Sharma",
    phone: "+919876500002",
    business_name: "Sharma Plumbing",
    kyc_status: "verified",
    is_online: false,
    user_is_active: true,
    active_pro_count: 3,
    created_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

function pro(overrides: Partial<TeamPro> = {}): TeamPro {
  return {
    id: PRO_OLD,
    service_provider_id: SP_A,
    user_id: "u-asha",
    display_name: "Asha",
    phone: "+919876500010",
    user_is_active: true,
    profile_photo_url: null,
    kyc_status: "verified",
    is_online: false,
    is_active: true,
    is_self: false,
    accepts_direct_jobs: true,
    active_job_count: 0,
    created_at: "2026-10-02T10:00:00Z",
    ...overrides,
  };
}

function action(overrides: Partial<AdminAction> = {}): AdminAction {
  return {
    id: "act-1",
    admin_user_id: "a1",
    admin_name: "Ops Person",
    action: "pro_reassigned",
    target_type: "professional",
    target_id: PRO_OLD,
    sp_user_id: SP_A,
    to_sp_user_id: SP_B,
    reason: "Merged",
    details: { to_professional_id: PRO_NEW, reactivated: false, kyc_status: "pending" },
    created_at: "2026-11-09T06:00:00Z",
    ...overrides,
  };
}

describe("validateSpsSearch", () => {
  it("keeps every known filter, with the booleans the router parses", () => {
    expect(validateSpsSearch({ q: "sharma", active: false, kyc: "verified", page: 3 })).toEqual({
      q: "sharma",
      active: false,
      kyc: "verified",
      page: 3,
    });
    expect(validateSpsSearch({ active: "true" }).active).toBe(true);
  });

  it("reads a phone the router parsed into a number as the digits typed", () => {
    expect(validateSpsSearch({ q: 98765 }).q).toBe("98765");
  });

  it("sets every bad value to undefined, because the router merges the raw URL back in", () => {
    const search = validateSpsSearch({ q: "s", active: "yes", kyc: "approved", page: 1 });
    expect(Object.keys(search).sort()).toEqual(["active", "kyc", "page", "q"]);
    expect(Object.values(search).every((value) => value === undefined)).toBe(true);
  });
});

describe("validateProsSearch", () => {
  it("keeps every known filter and lower-cases the SP id", () => {
    expect(
      validateProsSearch({
        q: "asha",
        sp: SP_A.toUpperCase(),
        status: "removed",
        kyc: "pending",
        online: true,
        page: 2,
      }),
    ).toEqual({ q: "asha", sp: SP_A, status: "removed", kyc: "pending", online: true, page: 2 });
  });

  it("drops a non-UUID SP, an unknown membership and a 1-character search", () => {
    const search = validateProsSearch({ sp: "sharma", status: "gone", q: " a ", online: "maybe" });
    expect(search.sp).toBeUndefined();
    expect(search.status).toBeUndefined();
    expect(search.q).toBeUndefined();
    expect(search.online).toBeUndefined();
  });

  it("counts false as a filter: offline is a real choice", () => {
    expect(hasProFilters({ online: false })).toBe(true);
    expect(hasProFilters({})).toBe(false);
    expect(hasSpFilters({ active: false })).toBe(true);
    expect(hasSpFilters({ page: 2 })).toBe(false);
  });
});

describe("API paths", () => {
  it("asks for 25 SPs and maps each filter to the backend's name", () => {
    expect(params(spsListPath({}))).toEqual({ page: "1", per_page: "25" });
    expect(params(spsListPath({ q: "98 76", active: false, kyc: "rejected", page: 2 }))).toEqual({
      q: "98 76",
      is_active: "false",
      kyc_status: "rejected",
      page: "2",
      per_page: "25",
    });
  });

  it("maps the Pro filters, membership included", () => {
    expect(
      params(
        prosListPath({ sp: SP_A, status: "removed", kyc: "verified", online: false, q: "as" }),
      ),
    ).toEqual({
      q: "as",
      sp_user_id: SP_A,
      is_active: "false",
      kyc_status: "verified",
      is_online: "false",
      page: "1",
      per_page: "25",
    });
    expect(params(prosListPath({ status: "active" })).is_active).toBe("true");
  });

  it("asks the picker only for active, verified SPs, and never sends a 1-character q", () => {
    expect(params(reassignTargetsPath("s"))).toEqual({
      is_active: "true",
      kyc_status: "verified",
      page: "1",
      per_page: "25",
    });
    expect(params(reassignTargetsPath(" sh ")).q).toBe("sh");
  });

  it("builds the history, jobs and payouts reads", () => {
    expect(params(spActionsPath(SP_A, 2))).toEqual({
      sp_user_id: SP_A,
      page: "2",
      per_page: "50",
    });
    expect(params(proActionsPath(PRO_OLD, 1))).toEqual({
      target_type: "professional",
      target_id: PRO_OLD,
      page: "1",
      per_page: "50",
    });
    expect(params(proJobsPath(PRO_OLD))).toEqual({
      professional_id: PRO_OLD,
      page: "1",
      per_page: "10",
    });
    expect(spPayoutSummaryPath(SP_A)).toBe(`/admin/providers/${SP_A}/payouts?page=1&per_page=5`);
  });

  it("says a full page may have more, and a short one hasn't", () => {
    expect(mayHaveMore(new Array(25).fill(0), 25)).toBe(true);
    expect(mayHaveMore(new Array(24).fill(0), 25)).toBe(false);
  });

  it("links the 30-day volume to exactly the rows it counted", () => {
    expect(spBookingsSearch(SP_A, { since: "2026-10-11" })).toEqual({
      provider_id: SP_A,
      from: "2026-10-11",
      status: undefined,
    });
    expect(spBookingsSearch(SP_A, { since: "2026-10-11" }, "completed").status).toBe("completed");
  });
});

describe("labels", () => {
  it("names an SP by whatever they set, else the phone", () => {
    expect(spLabel(sp())).toBe("Vikram Sharma · Sharma Plumbing");
    expect(spLabel(sp({ name: null }))).toBe("Sharma Plumbing");
    expect(spLabel(sp({ name: " ", business_name: null }))).toBe("+919876500002");
  });

  it("shows the service area as a centre and radius, or Not set", () => {
    expect(formatServiceArea({ lat: 12.97159, lng: 77.594566, radius_km: 5 })).toBe(
      "12.9716, 77.5946 · 5 km radius",
    );
    expect(formatServiceArea(null)).toBe("Not set");
  });

  it("reads an SP's 0 rating as none yet", () => {
    expect(formatSpRating(0)).toBe("No ratings yet");
    expect(formatSpRating(4.56)).toBe("4.6 / 5");
  });

  it("says No reviews yet for a Pro with none", () => {
    expect(formatProRating(null, 0)).toBe("No reviews yet");
    expect(formatProRating(4.5, 1)).toBe("4.5 / 5 (1 review)");
    expect(formatProRating(4, 12)).toBe("4.0 / 5 (12 reviews)");
  });

  it("formats an IST day without a zone moving it", () => {
    expect(formatDay("2026-10-11")).toBe("11 Oct 2026");
    expect(formatDay("garbage")).toBe("garbage");
  });

  it("uses the KYC screen's words, and survives a status added later", () => {
    expect(kycLabel("verified")).toBe("Approved");
    expect(kycLabel("pending")).toBe("Not submitted");
    expect(kycLabel("on_hold")).toBe("On hold");
    expect(inviteStatusLabel("EXPIRED")).toBe("Expired");
  });
});

describe("rules", () => {
  it("lets admin and ops change teams, never support", () => {
    expect(canEditTeam("admin")).toBe(true);
    expect(canEditTeam("ops")).toBe(true);
    expect(canEditTeam("support")).toBe(false);
  });

  it("offers the writes only on an active row that isn't the SP's own", () => {
    expect(isActionable(pro())).toBe(true);
    expect(isActionable(pro({ is_active: false }))).toBe(false);
    expect(isActionable(pro({ is_self: true }))).toBe(false);
  });

  it("checks the reason against the backend's 3..500", () => {
    expect(checkReason("  ab ")).toEqual({
      ok: false,
      message: "Enter a reason of at least 3 characters.",
    });
    expect(checkReason("x".repeat(501)).ok).toBe(false);
    expect(checkReason("  Merged  ")).toEqual({ ok: true, reason: "Merged" });
  });

  it("marks the Pro's own SP, and anyone the backend would refuse", () => {
    expect(reassignTargetBlock(sp({ user_id: SP_A }), SP_A)).toBe("Current team");
    expect(reassignTargetBlock(sp({ user_is_active: false }), SP_A)).toBe("Deactivated");
    expect(reassignTargetBlock(sp({ kyc_status: "submitted" }), SP_A)).toBe("KYC not approved");
    expect(reassignTargetBlock(sp(), SP_A)).toBeNull();
  });
});

describe("refusals", () => {
  const err = (status: number, code?: string, message = "Backend says no", details?: object) =>
    new ApiError(status, message, code, undefined, details as Record<string, unknown>);

  it.each([
    "PRO_HAS_ACTIVE_JOB",
    "PRO_NOT_FOUND",
    "CANNOT_REASSIGN_SELF",
    "SAME_SERVICE_PROVIDER",
    "TARGET_SP_NOT_FOUND",
    "TARGET_SP_INACTIVE",
    "TARGET_SP_KYC_INCOMPLETE",
    "USER_INACTIVE",
    "ALREADY_ON_TEAM",
  ])("has its own words for the reassign refusal %s", (code) => {
    const copy = reassignErrorCopy(err(409, code));
    expect(copy).not.toBe("Backend says no");
    expect(copy.length).toBeGreaterThan(10);
  });

  it.each(["PRO_HAS_ACTIVE_JOB", "PRO_NOT_FOUND", "CANNOT_REMOVE_SELF"])(
    "has its own words for the force-remove refusal %s",
    (code) => {
      expect(forceRemoveErrorCopy(err(409, code))).not.toBe("Backend says no");
    },
  );

  it("shows the backend's message for a 4xx it has no words for, and hides a 5xx", () => {
    expect(reassignErrorCopy(err(409, "SOMETHING_NEW"))).toBe("Backend says no");
    expect(reassignErrorCopy(err(422))).toBe("The reason must be 3–500 characters.");
    expect(reassignErrorCopy(err(403))).toBe("Your role can't change teams.");
    expect(reassignErrorCopy(err(500))).toBe("Couldn't move this Pro. Try again.");
    expect(forceRemoveErrorCopy(new Error("offline"))).toBe("Couldn't remove this Pro. Try again.");
  });

  it("finds the blocking booking on an active-job refusal, and nothing on any other", () => {
    expect(activeJobId(err(409, "PRO_HAS_ACTIVE_JOB", "", { booking_ids: [BOOKING] }))).toBe(
      BOOKING,
    );
    expect(activeJobId(err(409, "PRO_HAS_ACTIVE_JOB"))).toBeNull();
    expect(activeJobId(err(409, "PRO_HAS_ACTIVE_JOB", "", { booking_ids: ["../x"] }))).toBeNull();
    expect(activeJobId(err(404, "PRO_NOT_FOUND"))).toBeUndefined();
  });
});

describe("history sentences", () => {
  const team = [pro(), pro({ id: PRO_NEW, service_provider_id: SP_B })];

  it("tells the old SP the Pro moved away, and links the new one", () => {
    expect(describeSpAction(action(), SP_A, team)).toEqual({
      summary: "Asha was moved to another team",
      notes: ["Started with KYC not submitted on the new team."],
      links: [{ kind: "sp", id: SP_B, label: "Open the other SP" }],
    });
  });

  it("tells the new SP the Pro moved in, naming them by their new row", () => {
    const sentence = describeSpAction(action(), SP_B, [team[1]]);
    expect(sentence.summary).toBe("Asha was moved here from another team");
    expect(sentence.links).toEqual([{ kind: "sp", id: SP_A, label: "Open the other SP" }]);
  });

  it("says when a reactivated row kept its own KYC, and when the old SP was switched back on", () => {
    const sentence = describeSpAction(
      action({ details: { reactivated: true, kyc_status: "verified", self_reenabled: true } }),
      SP_A,
      team,
    );
    expect(sentence.notes).toEqual([
      "Rejoined an earlier row on the new team, keeping its own KYC (Approved).",
      "The old SP was switched back to taking jobs themselves.",
    ]);
  });

  it("describes a force remove and a deactivation", () => {
    expect(
      describeSpAction(action({ action: "pro_force_removed", to_sp_user_id: null }), SP_A, team)
        .summary,
    ).toBe("Asha was force-removed from the team");
    expect(
      describeSpAction(
        action({
          action: "user_deactivated",
          target_type: "user",
          target_id: SP_A,
          details: { removed_professional_ids: ["p1", "p2"], self_reenabled_sp_ids: [] },
        }),
        SP_A,
        team,
      ),
    ).toEqual({
      summary: "The SP's account was deactivated",
      notes: ["Removed from 2 teams."],
      links: [],
    });
  });

  it("falls back to A Pro when the row isn't on this team", () => {
    expect(describeSpAction(action(), SP_A, []).summary).toBe("A Pro was moved to another team");
  });

  describe("from a Pro row's side", () => {
    it("tells the OLD row it moved away, linking the new SP and the new row", () => {
      expect(describeProAction(action(), PRO_OLD)).toEqual({
        summary: "Moved to another team",
        notes: ["Started with KYC not submitted on the new team."],
        links: [
          { kind: "sp", id: SP_B, label: "Open the new SP" },
          { kind: "pro", id: PRO_NEW, label: "Open their new Pro row" },
        ],
      });
    });

    it("tells the NEW row it moved here, linking the old SP and the old row", () => {
      expect(describeProAction(action(), PRO_NEW)).toEqual({
        summary: "Moved here from another team",
        notes: ["Started with KYC not submitted on the new team."],
        links: [
          { kind: "sp", id: SP_A, label: "Open the old SP" },
          { kind: "pro", id: PRO_OLD, label: "Open their old Pro row" },
        ],
      });
    });

    it("keeps the reactivated KYC note on a reactivated row, without the old SP's setting", () => {
      const row = action({
        details: {
          to_professional_id: PRO_NEW,
          reactivated: true,
          kyc_status: "verified",
          self_reenabled: true,
        },
      });
      expect(describeProAction(row, PRO_NEW).notes).toEqual([
        "Rejoined an earlier row on the new team, keeping its own KYC (Approved).",
      ]);
      expect(describeProAction(row, PRO_OLD).notes).toEqual([
        "Rejoined an earlier row on the new team, keeping its own KYC (Approved).",
        "The old SP was switched back to taking jobs themselves.",
      ]);
    });

    it("drops a link it can't build, rather than linking nowhere", () => {
      const sentence = describeProAction(action({ details: {}, to_sp_user_id: null }), PRO_OLD);
      expect(sentence.summary).toBe("Moved to another team");
      expect(sentence.links).toEqual([]);
    });

    it("says a deactivation removed this row when it lists the row", () => {
      const deactivated = action({
        action: "user_deactivated",
        target_type: "user",
        target_id: "u-asha",
        to_sp_user_id: null,
        details: { removed_professional_ids: [PRO_OLD], self_reenabled_sp_ids: [] },
      });
      expect(describeProAction(deactivated, PRO_OLD)).toEqual({
        summary: "Removed: their account was deactivated",
        notes: [],
        links: [],
      });
      expect(describeProAction(deactivated, PRO_NEW).summary).toBe("Their account was deactivated");
    });

    it("describes a force remove as today", () => {
      expect(
        describeProAction(action({ action: "pro_force_removed", to_sp_user_id: null }), PRO_OLD),
      ).toEqual({ summary: "Force-removed from the team", notes: [], links: [] });
    });
  });
});
