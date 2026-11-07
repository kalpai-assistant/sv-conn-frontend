import { describe, expect, it } from "vitest";
import {
  KYC_FLAG_LABELS,
  KYC_PENDING_COUNT_PATH,
  KYC_TABS,
  canReviewKyc,
  checkRejectReason,
  confidencePct,
  formatKycAge,
  humanFlag,
  kycAgeDotClass,
  kycDisplayName,
  kycQueuePath,
  kycReviewPath,
  kycRowAgeSource,
  kycRowKey,
  kycStatusLabel,
  looksMismatched,
  validateKycSearch,
  verdictBadge,
} from "@/lib/kyc";
import { KYC_VERDICT_FIXTURES, proRow, spRow } from "@/test/kyc-fixtures";

const query = (path: string) => new URL(path, "http://x").searchParams;

describe("verdictBadge", () => {
  it("emits a green pill for auto_approve", () => {
    const spec = verdictBadge(KYC_VERDICT_FIXTURES.auto_approve);
    expect(spec.label).toBe("AI: Auto-approved");
    expect(spec.className).toMatch(/green/);
  });

  it("emits an amber pill with the top flag for needs_review", () => {
    const spec = verdictBadge(KYC_VERDICT_FIXTURES.needs_review);
    expect(spec.label).toBe(
      "AI: Needs review — Name on Aadhaar doesn't match provider's stated name",
    );
    expect(spec.className).toMatch(/amber/);
  });

  it("emits a red pill with the top flag for reject", () => {
    const spec = verdictBadge(KYC_VERDICT_FIXTURES.reject);
    expect(spec.label).toBe("AI: Rejected — Aadhaar photo is blurred — text OCR failed");
    expect(spec.className).toMatch(/red/);
  });

  it("emits a grey unavailable pill for a null verdict", () => {
    const spec = verdictBadge(null);
    expect(spec.label).toBe("AI: unavailable");
    expect(spec.className).not.toMatch(/green|amber|red/);
  });

  it("falls back to a flag-less label when needs_review has no flags", () => {
    const spec = verdictBadge({ ...KYC_VERDICT_FIXTURES.needs_review, flags: [] });
    expect(spec.label).toBe("AI: Needs review");
  });

  // Night mode only swaps tokens, so a fixed light pill has to bring its own text colour.
  it.each(["auto_approve", "needs_review", "reject"] as const)(
    "gives the %s pill its own text colour, and no inert dark: classes",
    (outcome) => {
      const { className } = verdictBadge(KYC_VERDICT_FIXTURES[outcome]);
      expect(className).toMatch(/text-(green|amber|red)-900/);
      expect(className).not.toContain("dark:");
    },
  );
});

describe("humanFlag", () => {
  it("resolves known codes to their human string", () => {
    expect(humanFlag("name_mismatch")).toBe(KYC_FLAG_LABELS.name_mismatch);
  });

  it("returns the raw code for unknown flags", () => {
    expect(humanFlag("brand_new_flag_from_the_future")).toBe("brand_new_flag_from_the_future");
  });

  // Every code the backend sets: flags.append(...) and flags=[...] in
  // app/services/kyc_verifier.py, and flags=[...] in provider_service.py.
  it.each([
    "llm_unavailable",
    "docs_unreadable",
    "not_aadhaar",
    "tampered",
    "blurry_front",
    "blurry_back",
    "blurry_selfie",
    "name_mismatch",
    "name_close",
    "name_unreadable",
    "dob_mismatch",
    "dob_unparseable",
    "selfie_no_match",
    "selfie_low_match",
    "extraction_incomplete",
  ])("has a label for %s, which the backend emits", (code) => {
    expect(KYC_FLAG_LABELS[code]).toBeTruthy();
    expect(humanFlag(code)).not.toBe(code);
  });

  it("doesn't word the weaker signals as a mismatch", () => {
    expect(humanFlag("name_close")).not.toMatch(/doesn't match/);
    expect(humanFlag("selfie_low_match")).not.toMatch(/doesn't match/);
    expect(humanFlag("selfie_no_match")).toMatch(/doesn't match/);
  });
});

describe("confidencePct", () => {
  it("scales 0..1 to 0..100 and rounds", () => {
    expect(confidencePct(0.923)).toBe(92);
    expect(confidencePct(0)).toBe(0);
    expect(confidencePct(1)).toBe(100);
  });

  it("clamps out-of-range inputs so the bar can't overflow", () => {
    expect(confidencePct(1.3)).toBe(100);
    expect(confidencePct(-0.5)).toBe(0);
  });
});

describe("looksMismatched", () => {
  it("ignores case, punctuation and whitespace differences", () => {
    expect(looksMismatched("Jane Q. Doe", "jane q doe")).toBe(false);
    expect(looksMismatched("Ramesh  Kumar", "Ramesh Kumar")).toBe(false);
  });

  it("flags genuine differences", () => {
    expect(looksMismatched("Jane Doe", "Ramesh Kumar")).toBe(true);
    expect(looksMismatched("1990-05-14", "1990-05-15")).toBe(true);
  });

  it("treats a null on either side as a non-mismatch, because it shows as a dash", () => {
    expect(looksMismatched(null, "Jane")).toBe(false);
    expect(looksMismatched("Jane", null)).toBe(false);
    expect(looksMismatched(null, null)).toBe(false);
  });
});

describe("the queue's paths", () => {
  it.each([
    ["pending", "submitted"],
    ["approved", "verified"],
    ["rejected", "rejected"],
    ["auto-approved", "auto_approved"],
    ["all", "all"],
  ] as const)("%s asks for status=%s, always with team Pros", (tab, status) => {
    const params = query(kycQueuePath(tab, 3));
    expect(params.get("status")).toBe(status);
    expect(params.get("kind")).toBe("all");
    expect(params.get("page")).toBe("3");
    expect(params.get("per_page")).toBe("50");
  });

  it("lists the filters in the order the screen shows them", () => {
    expect(KYC_TABS.map((tab) => tab.label)).toEqual([
      "Pending",
      "Approved",
      "Rejected",
      "Auto-approved",
      "All",
    ]);
  });

  it("counts pending rows, team Pros included, because the default kind leaves them out", () => {
    const params = query(KYC_PENDING_COUNT_PATH);
    expect(params.get("status")).toBe("submitted");
    expect(params.get("kind")).toBe("all");
  });
});

describe("addressing a row", () => {
  it("uses the SP routes with the user id for an SP", () => {
    expect(kycReviewPath(spRow())).toBe("/admin/providers/u-asha/kyc");
  });

  it("uses the Pro routes with the professional id for a Pro, never its user id", () => {
    const path = kycReviewPath(proRow());
    expect(path).toBe("/admin/pros/p-hari/kyc");
    expect(path).not.toContain("u-hari");
  });

  it("keys an SP and a Pro with the same user id apart", () => {
    const sp = spRow({ id: "same" });
    const pro = proRow({ id: "same" });
    expect(kycRowKey(sp)).not.toBe(kycRowKey(pro));
  });
});

describe("validateKycSearch", () => {
  it("keeps good values", () => {
    expect(validateKycSearch({ tab: "rejected", page: 2 })).toEqual({ tab: "rejected", page: 2 });
  });

  it.each([["nonsense"], [7], [null], [{ a: 1 }]])("sets a bad tab (%j) to undefined", (tab) => {
    const search = validateKycSearch({ tab });
    expect(search.tab).toBeUndefined();
    // Explicitly, or the router's merge would keep the raw value.
    expect(Object.keys(search)).toContain("tab");
  });

  it.each([[0], [-1], [1.5], ["text"], ["2"], [null], [Number.MAX_VALUE]])(
    "sets a bad page (%j) to undefined",
    (page) => {
      const search = validateKycSearch({ page });
      expect(search.page).toBeUndefined();
      expect(Object.keys(search)).toContain("page");
    },
  );

  it("keeps the defaults out of the URL", () => {
    expect(validateKycSearch({ tab: "pending", page: 1 })).toEqual({
      tab: undefined,
      page: undefined,
    });
  });
});

describe("checkRejectReason", () => {
  it("trims the reason", () => {
    expect(checkRejectReason("  blurred photo \n")).toEqual({ ok: true, reason: "blurred photo" });
  });

  it.each([[""], ["   "], ["\n\t "]])("refuses a blank reason (%j)", (text) => {
    expect(checkRejectReason(text).ok).toBe(false);
  });

  it("accepts exactly 500 characters and refuses 501, counted after the trim", () => {
    expect(checkRejectReason("x".repeat(500)).ok).toBe(true);
    expect(checkRejectReason(`  ${"x".repeat(500)}  `).ok).toBe(true);
    expect(checkRejectReason("x".repeat(501)).ok).toBe(false);
  });
});

describe("canReviewKyc", () => {
  it("lets admin and ops act, and not support", () => {
    expect(canReviewKyc("admin")).toBe(true);
    expect(canReviewKyc("ops")).toBe(true);
    expect(canReviewKyc("support")).toBe(false);
  });
});

describe("row labels", () => {
  it("shows a placeholder for a row with no name", () => {
    expect(kycDisplayName({ name: null })).toBe("(no name yet)");
    expect(kycDisplayName({ name: "" })).toBe("(no name yet)");
    expect(kycDisplayName({ name: "Asha" })).toBe("Asha");
  });

  it("uses the console's words for each status", () => {
    expect(kycStatusLabel("submitted")).toBe("Pending");
    expect(kycStatusLabel("verified")).toBe("Approved");
    expect(kycStatusLabel("rejected")).toBe("Rejected");
  });
});

describe("a row's age", () => {
  const NOW = Date.parse("2026-11-07T12:00:00Z");

  it("runs from submission while waiting, and from the decision afterwards", () => {
    const submitted = "2026-11-01T00:00:00Z";
    const reviewed = "2026-11-02T00:00:00Z";
    expect(kycRowAgeSource(spRow({ kyc_submitted_at: submitted }))).toBe(submitted);
    expect(
      kycRowAgeSource(
        spRow({ kyc_status: "verified", kyc_submitted_at: submitted, kyc_reviewed_at: reviewed }),
      ),
    ).toBe(reviewed);
    expect(
      kycRowAgeSource(
        spRow({ kyc_status: "verified", kyc_submitted_at: submitted, kyc_reviewed_at: null }),
      ),
    ).toBe(submitted);
  });

  it.each([
    ["2026-11-07T11:59:30Z", "30 seconds ago"],
    ["2026-11-07T11:59:00Z", "1 minute ago"],
    ["2026-11-07T09:00:00Z", "3 hours ago"],
    ["2026-11-04T12:00:00Z", "3 days ago"],
    ["2026-09-01T12:00:00Z", "2 months ago"],
    ["2024-11-01T12:00:00Z", "2 years ago"],
  ])("reads %s as %s", (iso, label) => {
    expect(formatKycAge(iso, NOW)).toBe(label);
  });

  it("reads a time slightly ahead of this clock as now", () => {
    expect(formatKycAge("2026-11-07T12:00:05Z", NOW)).toBe("0 seconds ago");
  });

  it("has nothing to say about a missing or unreadable time", () => {
    expect(formatKycAge(null, NOW)).toBeNull();
    expect(formatKycAge("not a date", NOW)).toBeNull();
  });

  it.each([
    ["2026-11-07T00:00:00Z", "bg-green-500"],
    ["2026-11-06T12:00:00Z", "bg-green-500"],
    ["2026-11-05T12:00:00Z", "bg-yellow-500"],
    ["2026-11-04T12:00:00Z", "bg-yellow-500"],
    ["2026-11-04T11:00:00Z", "bg-red-500"],
  ])("colours the dot for %s as %s", (iso, colour) => {
    expect(kycAgeDotClass(iso, NOW)).toBe(colour);
  });
});
