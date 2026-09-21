/**
 * Verdict helpers + fixture render smoke test (SVC-308).
 *
 * These tests pull double duty:
 *
 * 1. They freeze the fixture shape against SVC-307's `KYCVerdict` Pydantic
 *    model. When the backend PR lands the fixture stops being fixture and
 *    becomes documentation of the wire contract — anything that would
 *    silently break the contract has to break these tests first.
 * 2. `verdictBadge` and `humanFlag` are branchless-looking one-liners with
 *    load-bearing behaviour: an unknown outcome would blow the sheet up,
 *    and a null verdict has to render the "unavailable" pill rather than
 *    an empty section. Pinning both is cheap.
 */
import { describe, expect, it } from "vitest";
import {
  KYC_FLAG_LABELS,
  KYC_VERDICT_FIXTURES,
  confidencePct,
  humanFlag,
  looksMismatched,
  verdictBadge,
} from "@/routes/admin.kyc";

describe("verdictBadge", () => {
  it("emits a green pill for auto_approve", () => {
    const spec = verdictBadge(KYC_VERDICT_FIXTURES.auto_approve);
    expect(spec.label).toBe("AI: Auto-approved");
    expect(spec.className).toMatch(/green/);
  });

  it("emits an amber pill with the top flag for needs_review", () => {
    const spec = verdictBadge(KYC_VERDICT_FIXTURES.needs_review);
    // Top flag on the fixture is `name_mismatch`, which humanFlag turns into
    // the "Name on Aadhaar doesn't match…" string. The badge label always
    // uses the human form so a reviewer never has to look up a code.
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

  it("emits a grey unavailable pill for null (pre-SVC-307 submissions)", () => {
    const spec = verdictBadge(null);
    expect(spec.label).toBe("AI: unavailable");
    // Grey pill == secondary variant; the intent is "no colour", not amber.
    expect(spec.className).not.toMatch(/green|amber|red/);
  });

  it("falls back to a flag-less label when needs_review has no flags", () => {
    const spec = verdictBadge({
      ...KYC_VERDICT_FIXTURES.needs_review,
      flags: [],
    });
    expect(spec.label).toBe("AI: Needs review");
  });
});

describe("humanFlag", () => {
  it("resolves known codes to their human string", () => {
    expect(humanFlag("name_mismatch")).toBe(KYC_FLAG_LABELS.name_mismatch);
  });

  it("returns the raw code for unknown flags", () => {
    // The whole point of a plain map — a future backend flag doesn't block
    // the sheet from rendering; the reviewer sees the code and files a bug.
    expect(humanFlag("brand_new_flag_from_the_future")).toBe("brand_new_flag_from_the_future");
  });
});

describe("confidencePct", () => {
  it("scales 0..1 to 0..100 and rounds", () => {
    expect(confidencePct(0.923)).toBe(92);
    expect(confidencePct(0)).toBe(0);
    expect(confidencePct(1)).toBe(100);
  });

  it("clamps out-of-range inputs so the bar can't overflow", () => {
    // A future model handing back 1.03 or -0.01 shouldn't render a bar
    // wider than its track or a negative width. Pinned here so a regression
    // in the scaler is caught by a fast unit test.
    expect(confidencePct(1.3)).toBe(100);
    expect(confidencePct(-0.5)).toBe(0);
  });
});

describe("looksMismatched", () => {
  it("ignores case, punctuation and whitespace differences", () => {
    // These are the noise sources we've seen from OCR — full stops on
    // initials, double spaces, mixed case. A flag on any of them would be
    // reviewer fatigue, not a real signal.
    expect(looksMismatched("Jane Q. Doe", "jane q doe")).toBe(false);
    expect(looksMismatched("Ramesh  Kumar", "Ramesh Kumar")).toBe(false);
  });

  it("flags genuine differences", () => {
    expect(looksMismatched("Jane Doe", "Ramesh Kumar")).toBe(true);
    expect(looksMismatched("1990-05-14", "1990-05-15")).toBe(true);
  });

  it("treats a null on either side as a non-mismatch (rendered as —)", () => {
    // Rendering handles the null case — the row shows "—" for whichever
    // side is missing. Flagging it as amber would highlight rows for the
    // wrong reason.
    expect(looksMismatched(null, "Jane")).toBe(false);
    expect(looksMismatched("Jane", null)).toBe(false);
    expect(looksMismatched(null, null)).toBe(false);
  });
});

describe("KYC_VERDICT_FIXTURES", () => {
  it("covers all three outcomes + is null-verdict compatible in the sheet", () => {
    // Verdict-level fixture surface. Null-verdict has no fixture to freeze
    // because it's literally `null`, exercised in verdictBadge above.
    expect(KYC_VERDICT_FIXTURES.auto_approve.outcome).toBe("auto_approve");
    expect(KYC_VERDICT_FIXTURES.needs_review.outcome).toBe("needs_review");
    expect(KYC_VERDICT_FIXTURES.reject.outcome).toBe("reject");
  });

  it("keeps the extracted-fields shape stable against SVC-307's Pydantic model", () => {
    // Any change to this list means SVC-307's `KYCVerdictExtracted` model
    // moved without the frontend snapshot moving with it — mismatched
    // shapes would silently render "—" everywhere. The frontend TS type
    // catches missing fields at build time; this test catches accidental
    // additions that would go unnoticed until QA.
    const extracted = KYC_VERDICT_FIXTURES.auto_approve.extracted;
    expect(Object.keys(extracted).sort()).toEqual(
      ["aadhaar_last4", "address", "dob", "gender", "name_en", "name_local"].sort(),
    );
  });
});
