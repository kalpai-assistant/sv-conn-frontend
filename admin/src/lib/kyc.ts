/**
 * The KYC queue (SVC-424). The contract is the "KYC queue" section of the backend's
 * ADMIN.md. The flag, verdict, confidence and mismatch helpers are copied from the
 * consumer app's src/routes/admin.kyc.tsx, which SVC-434 removes.
 */
import type { AdminRole } from "@/lib/auth";

export const KYC_PAGE_SIZE = 50;
/** The most a reject reason may be. The backend refuses anything longer. */
export const KYC_REASON_MAX = 500;

export type KycStatus = "pending" | "submitted" | "verified" | "rejected";
export type KycVerdictOutcome = "auto_approve" | "needs_review" | "reject";

export interface KycVerdictExtracted {
  aadhaar_last4: string | null;
  name_en: string | null;
  name_local: string | null;
  dob: string | null;
  gender: string | null;
  address: string | null;
}

/** The API also sends raw_response. It's left out of this type so nothing can show it. */
export interface KycVerdict {
  outcome: KycVerdictOutcome;
  /** 0..1 */
  confidence: number;
  extracted: KycVerdictExtracted;
  /** Machine codes. Show them through humanFlag. */
  flags: string[];
}

interface KycRowBase {
  /** The person's user id. A Pro's is not an SP id: never use it on the SP routes. */
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  kyc_status: KycStatus;
  kyc_submitted_at: string | null;
  kyc_reviewed_at: string | null;
  kyc_rejection_reason: string | null;
}

export interface KycSpRow extends KycRowBase {
  kind: "sp";
}

export interface KycProRow extends KycRowBase {
  kind: "pro";
  professional_id: string;
  sp_user_id: string;
  sp_business_name: string | null;
}

export type KycQueueRow = KycSpRow | KycProRow;

export interface KycDetail {
  name: string | null;
  phone: string;
  kyc_status: KycStatus;
  kyc_submitted_at: string | null;
  kyc_reviewed_at: string | null;
  kyc_rejection_reason: string | null;
  /** Presigned for an hour. Null when that document wasn't uploaded. */
  aadhaar_front_url: string | null;
  aadhaar_back_url: string | null;
  selfie_url: string | null;
  /** Null when the AI verifier never scored this submission. */
  ai_verdict: KycVerdict | null;
  /** Pros only. */
  sp_business_name?: string | null;
}

export type KycTab = "pending" | "approved" | "rejected" | "auto-approved" | "all";

/** The filters, in display order, and the backend `status` each one asks for. */
export const KYC_TABS: { value: KycTab; label: string; status: string }[] = [
  { value: "pending", label: "Pending", status: "submitted" },
  { value: "approved", label: "Approved", status: "verified" },
  { value: "rejected", label: "Rejected", status: "rejected" },
  { value: "auto-approved", label: "Auto-approved", status: "auto_approved" },
  { value: "all", label: "All", status: "all" },
];

export const KYC_TAB_COPY: Record<
  KycTab,
  { subhead: string; emptyHead: string; emptyBody: string }
> = {
  pending: {
    subhead: "Providers waiting for verification. Select a row to review their documents.",
    emptyHead: "No pending reviews.",
    emptyBody: "All caught up. Newly submitted KYCs will appear here.",
  },
  approved: {
    subhead: "Approved KYCs, by an admin or the AI. Select a row to look up the documents.",
    emptyHead: "No approved KYCs yet.",
    emptyBody: "Approved KYCs will appear here for reference.",
  },
  rejected: {
    subhead: "Past rejections. Select a row to look up the rejection reason.",
    emptyHead: "No rejections yet.",
    emptyBody: "Rejected KYCs will appear here for reference.",
  },
  "auto-approved": {
    subhead: "Auto-approved by AI in the last 7 days. Select any row to spot-check the verdict.",
    emptyHead: "No auto-approvals in the last 7 days.",
    emptyBody: "The AI hasn't waved anyone through yet — nothing to spot-check.",
  },
  all: {
    subhead: "Every KYC someone has submitted, whatever its status, newest first.",
    emptyHead: "No KYC submissions yet.",
    emptyBody: "Submitted KYCs will appear here.",
  },
};

export interface KycSearch {
  tab?: Exclude<KycTab, "pending">;
  page?: number;
}

/**
 * Reads the URL. A bad value is set to undefined, not left out: the router merges
 * the raw search over this result, so a missing key would keep the bad value.
 * Pending and page 1 are the defaults, so they stay out of the URL too.
 */
export function validateKycSearch(raw: Record<string, unknown>): KycSearch {
  const tab = KYC_TABS.find((known) => known.value === raw.tab)?.value;
  const page = raw.page;
  return {
    tab: tab === "pending" ? undefined : tab,
    page: typeof page === "number" && Number.isSafeInteger(page) && page > 1 ? page : undefined,
  };
}

/** Always kind=all, because the backend's default leaves team Pros out. */
export function kycQueuePath(tab: KycTab, page: number): string {
  const status = KYC_TABS.find((known) => known.value === tab)?.status ?? "submitted";
  const params = new URLSearchParams({
    status,
    kind: "all",
    page: String(page),
    per_page: String(KYC_PAGE_SIZE),
  });
  return `/admin/providers/kyc/pending?${params}`;
}

/** The sidebar badge: everything waiting for a human, team Pros included. */
export const KYC_PENDING_COUNT_PATH =
  "/admin/providers/kyc/pending/count?status=submitted&kind=all";

/** A person can be both an SP and a Pro under one user id, so id alone can't key a row. */
export function kycRowKey(row: KycQueueRow): string {
  return row.kind === "pro" ? `pro:${row.professional_id}` : `sp:${row.id}`;
}

/** Where a row's detail lives. Its verify and reject routes hang off the same path. */
export function kycReviewPath(row: KycQueueRow): string {
  return row.kind === "pro"
    ? `/admin/pros/${row.professional_id}/kyc`
    : `/admin/providers/${row.id}/kyc`;
}

export function kycDisplayName(row: { name: string | null }): string {
  return row.name || "(no name yet)";
}

/** Support reads the queue but can't act on it. The backend enforces this too. */
export function canReviewKyc(role: AdminRole): boolean {
  return role === "admin" || role === "ops";
}

export function kycStatusLabel(status: KycStatus): string {
  switch (status) {
    case "submitted":
      return "Pending";
    case "verified":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "pending":
      return "Not submitted";
  }
}

/** Trims the reason and says what's wrong with it, if anything. */
export function checkRejectReason(
  text: string,
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = text.trim();
  if (reason.length === 0) {
    return { ok: false, error: "Enter a reason for the rejection." };
  }
  if (reason.length > KYC_REASON_MAX) {
    return { ok: false, error: `Keep the reason to ${KYC_REASON_MAX} characters.` };
  }
  return { ok: true, reason };
}

/** A waiting row ages from when it was submitted, and a decided one from the decision. */
export function kycRowAgeSource(row: KycQueueRow): string | null {
  return row.kyc_status === "submitted"
    ? row.kyc_submitted_at
    : (row.kyc_reviewed_at ?? row.kyc_submitted_at);
}

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "always" });

/** "3 days ago", or null for a time that's missing or unreadable. */
export function formatKycAge(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  // A clock a little behind the server's shouldn't read "in 2 seconds".
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return relativeTime.format(-seconds, "second");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return relativeTime.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relativeTime.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return relativeTime.format(-days, "day");
  if (days < 365) return relativeTime.format(-Math.floor(days / 30), "month");
  return relativeTime.format(-Math.floor(days / 365), "year");
}

/** The traffic light on a pending row. Wall-clock hours, so a Sunday counts like a Tuesday. */
export function kycAgeDotClass(iso: string, now = Date.now()): string {
  const hours = (now - new Date(iso).getTime()) / (1000 * 60 * 60);
  return hours <= 24 ? "bg-green-500" : hours <= 72 ? "bg-yellow-500" : "bg-red-500";
}

/**
 * Machine flag codes → human strings. A plain map, so a code the frontend hasn't
 * been taught yet shows in its raw form instead of blocking the screen.
 *
 * The first group is what the backend emits: every code in app/services/kyc_verifier.py,
 * plus docs_unreadable from provider_service.py. Each label says what that check
 * found: name_close and selfie_low_match are weaker signals than the mismatch codes
 * beside them, so they mustn't read as a mismatch. The second group came from the
 * legacy screen, and the backend doesn't emit them.
 */
export const KYC_FLAG_LABELS: Record<string, string> = {
  not_aadhaar: "AI says this document isn't an Aadhaar",
  tampered: "AI says the Aadhaar looks tampered with",
  blurry_front: "Aadhaar front is blurry",
  blurry_back: "Aadhaar back is blurry",
  blurry_selfie: "Selfie is blurry",
  name_mismatch: "Name on Aadhaar doesn't match provider's stated name",
  name_close: "Name on Aadhaar is similar to provider's stated name, but not an exact match",
  name_unreadable: "Couldn't read the name on the Aadhaar",
  dob_mismatch: "Date of birth on Aadhaar doesn't match provider's stated DOB",
  dob_unparseable: "Couldn't read the date of birth on the Aadhaar as a date",
  selfie_no_match: "Selfie doesn't match the Aadhaar photo",
  selfie_low_match: "Selfie matches the Aadhaar photo, but the AI has low confidence",
  extraction_incomplete: "Couldn't read all of the Aadhaar's last 4 digits, name and gender",
  llm_unavailable: "AI check was unavailable, so it didn't score this submission",
  docs_unreadable: "AI check couldn't open the uploaded documents, so it didn't score them",

  blurred_selfie: "Selfie is blurred — face landmarks not extractable",
  blurred_aadhaar: "Aadhaar photo is blurred — text OCR failed",
  face_mismatch: "Face on selfie doesn't match the Aadhaar photo",
  selfie_not_live: "Selfie appears to be a photo of a photo, not a live capture",
  aadhaar_expired: "Aadhaar image looks tampered / expired format",
  underage: "Extracted DOB puts the provider under 18",
  low_ocr_confidence: "OCR confidence too low to trust extracted fields",
};

export const humanFlag = (code: string): string => KYC_FLAG_LABELS[code] ?? code;

/**
 * Verdict → pill. A null verdict gets the grey "unavailable" pill, and the caller
 * hides the extracted fields. The colours are fixed light pills with dark text, so
 * they read the same in night mode, where only the tokens change.
 */
export function verdictBadge(verdict: KycVerdict | null): { label: string; className: string } {
  if (!verdict) {
    return { label: "AI: unavailable", className: "bg-secondary text-secondary-foreground" };
  }
  const topFlag = verdict.flags[0];
  switch (verdict.outcome) {
    case "auto_approve":
      return { label: "AI: Auto-approved", className: "bg-green-100 text-green-900" };
    case "needs_review":
      return {
        label: topFlag ? `AI: Needs review — ${humanFlag(topFlag)}` : "AI: Needs review",
        className: "bg-amber-100 text-amber-900",
      };
    case "reject":
      return {
        label: topFlag ? `AI: Rejected — ${humanFlag(topFlag)}` : "AI: Rejected",
        className: "bg-red-100 text-red-900",
      };
  }
}

/** Confidence 0..1 → 0..100, clamped so an out-of-range value can't blow out the bar. */
export const confidencePct = (c: number): number => Math.max(0, Math.min(100, Math.round(c * 100)));

/**
 * Compares a stated value with an extracted one, ignoring case, punctuation and
 * spacing: enough to catch "Jane Q. Doe" vs "jane q doe" without calling an OCR
 * quirk a mismatch. A missing side isn't a mismatch, because it shows as a dash.
 */
export function looksMismatched(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  return norm(a) !== norm(b);
}
