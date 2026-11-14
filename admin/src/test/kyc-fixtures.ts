/** KYC rows, details and verdicts in the shape the backend sends them. */
import type { KycDetail, KycProRow, KycSpRow, KycVerdict } from "@/lib/kyc";

export function spRow(overrides: Partial<KycSpRow> = {}): KycSpRow {
  return {
    kind: "sp",
    id: "u-asha",
    phone: "+919000000001",
    name: "Asha Rao",
    email: "asha@example.test",
    kyc_status: "submitted",
    kyc_submitted_at: "2026-11-05T10:00:00Z",
    kyc_reviewed_at: null,
    kyc_rejection_reason: null,
    ...overrides,
  };
}

export function proRow(overrides: Partial<KycProRow> = {}): KycProRow {
  return {
    kind: "pro",
    id: "u-hari",
    professional_id: "p-hari",
    sp_user_id: "u-owner",
    sp_business_name: "Bright Homes",
    phone: "+919000000002",
    name: "Hari Kumar",
    email: null,
    kyc_status: "submitted",
    kyc_submitted_at: "2026-11-06T10:00:00Z",
    kyc_reviewed_at: null,
    kyc_rejection_reason: null,
    ...overrides,
  };
}

export const KYC_VERDICT_FIXTURES: {
  auto_approve: KycVerdict;
  needs_review: KycVerdict;
  reject: KycVerdict;
} = {
  auto_approve: {
    outcome: "auto_approve",
    confidence: 0.92,
    extracted: {
      aadhaar_last4: "1234",
      name_en: "Jane Q. Doe",
      name_local: "जेन डो",
      dob: "1990-05-14",
      gender: "F",
      address: "Line 1, Line 2, Bengaluru KA 560001",
    },
    flags: [],
  },
  needs_review: {
    outcome: "needs_review",
    confidence: 0.61,
    extracted: {
      aadhaar_last4: "5678",
      name_en: "Ramesh Kumar",
      name_local: "रमेश कुमार",
      dob: "1988-11-02",
      gender: "M",
      address:
        "House No. 42, 7th Cross, JP Nagar 3rd Phase, Bengaluru KA 560078 near the metro station",
    },
    flags: ["name_mismatch", "low_ocr_confidence"],
  },
  reject: {
    outcome: "reject",
    confidence: 0.34,
    extracted: {
      aadhaar_last4: null,
      name_en: null,
      name_local: null,
      dob: null,
      gender: null,
      address: null,
    },
    flags: ["blurred_aadhaar", "blurred_selfie"],
  },
};

export function kycDetail(overrides: Partial<KycDetail> = {}): KycDetail {
  return {
    name: "Asha Rao",
    phone: "+919000000001",
    kyc_status: "submitted",
    kyc_submitted_at: "2026-11-05T10:00:00Z",
    kyc_reviewed_at: null,
    kyc_rejection_reason: null,
    aadhaar_front_url: "https://docs.example.test/front.png?sig=1",
    aadhaar_back_url: "https://docs.example.test/back.png?sig=1",
    selfie_url: "https://docs.example.test/selfie.png?sig=1",
    ai_verdict: KYC_VERDICT_FIXTURES.needs_review,
    ...overrides,
  };
}
