/**
 * Admin KYC review page (SVC-90, SVC-298, SVC-308).
 *
 * Three-tab layout: Pending (default) waits on a human, Rejected surfaces
 * historical rejections read-only, and Auto-approved (SVC-308) is the AI
 * spot-check queue — providers the verifier bot waved through in the last
 * 7 days. Tab state lives in the URL (`?tab=rejected|auto-approved`) so a
 * refresh keeps the reviewer where they were.
 *
 * Tapping any row opens the same side sheet:
 *   - Pending row → Approve / Reject actions (as before).
 *   - Rejected row → read-only; the rejection reason is surfaced prominently.
 *   - Auto-approved row → read-only spot-check; the AI verdict, extracted
 *     Aadhaar fields and confidence bar are the whole point of the view.
 *
 * SVC-308 also injects a new "AI Analysis" section above the doc grid on
 * every sheet. When `kyc_ai_verdict` is null (old submissions predating the
 * SVC-307 backend), we render an "AI: unavailable" pill and hide the
 * extracted-fields table so the layout doesn't collapse.
 *
 * Auth: gated by admin role via the AppGate in __root.tsx.
 */
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { CheckCircle2, ChevronRight, Loader2, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useKYCQueue,
  useKYCReview,
  useVerifyKYC,
  useRejectKYC,
  type API_KYCQueueRow,
  type API_KYCVerdict,
  type KYCQueueStatus,
} from "@/hooks/useApi";

type TabKey = "pending" | "rejected" | "auto-approved";

const searchSchema = z.object({
  tab: z.enum(["pending", "rejected", "auto-approved"]).optional(),
});

export const Route = createFileRoute("/admin/kyc")({
  component: AdminKYCReviewPage,
  validateSearch: searchSchema,
});

// SVC-308: map from the tab key in the URL to the backend `?status=` value.
// Kept in one place so the tab UI, the row's age source, and the queue query
// never fall out of sync.
const TAB_TO_STATUS: Record<TabKey, KYCQueueStatus> = {
  pending: "submitted",
  rejected: "rejected",
  "auto-approved": "auto_approved",
};

function AdminKYCReviewPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab } = useSearch({ from: Route.fullPath });
  const activeTab: TabKey =
    tab === "rejected" ? "rejected" : tab === "auto-approved" ? "auto-approved" : "pending";
  const status = TAB_TO_STATUS[activeTab];

  const { data: rows, isLoading, isError, refetch } = useKYCQueue(status);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const setTab = (next: TabKey) => {
    // Drop the search key entirely for the default so we don't leave a stale
    // `?tab=pending` in the URL — cleaner shareable link.
    navigate({ search: next === "pending" ? {} : { tab: next } });
  };

  const copy = tabCopy(activeTab);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <header className="mb-6 flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">KYC review queue</h1>
          <p className="text-sm text-muted-foreground">{copy.subhead}</p>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabKey)} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="auto-approved">Auto-approved</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">Couldn't load the review queue.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows && rows.length === 0 && (
        <div className="rounded-lg border border-border bg-secondary/30 p-8 text-center">
          <p className="text-sm font-medium text-foreground">{copy.emptyHead}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.emptyBody}</p>
        </div>
      )}

      {!isLoading && rows && rows.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setSelectedUserId(row.id)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
              >
                <QueueRow row={row} variant={activeTab} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ReviewSheet
        userId={selectedUserId}
        readOnly={activeTab !== "pending"}
        variant={activeTab}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}

function tabCopy(tab: TabKey) {
  switch (tab) {
    case "pending":
      return {
        subhead: "Providers waiting for verification. Tap a row to review their documents.",
        emptyHead: "No pending reviews.",
        emptyBody: "All caught up. Newly submitted KYCs will appear here.",
      };
    case "rejected":
      return {
        subhead: "Past rejections — read-only. Tap a row to look up the rejection reason.",
        emptyHead: "No rejections yet.",
        emptyBody: "Rejected KYCs will appear here for reference.",
      };
    case "auto-approved":
      return {
        // Explicit about the AI + 7-day scope so the reviewer knows what they're
        // sampling. The tab isn't a queue to work through — it's a spot check.
        subhead: "Auto-approved by AI in the last 7 days. Tap any row to spot-check the verdict.",
        emptyHead: "No auto-approvals in the last 7 days.",
        emptyBody: "The AI hasn't waved anyone through yet — nothing to spot-check.",
      };
  }
}

function QueueRow({ row, variant }: { row: API_KYCQueueRow; variant: TabKey }) {
  // Pending shows time since submission; rejected + auto-approved show time
  // since the decision was recorded.
  const ageSource = variant === "pending" ? row.kyc_submitted_at : row.kyc_reviewed_at;

  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {row.name ?? "(no name yet)"}
        </p>
        <p className="truncate text-xs text-muted-foreground">{row.phone}</p>
        {variant === "rejected" && row.kyc_rejection_reason && (
          <p
            className="mt-1 truncate text-xs text-muted-foreground"
            title={row.kyc_rejection_reason}
          >
            Reason: {row.kyc_rejection_reason}
          </p>
        )}
      </div>
      <AgeBadge iso={ageSource} showDot={variant === "pending"} />
    </>
  );
}

function AgeBadge({ iso, showDot }: { iso: string | null; showDot: boolean }) {
  if (!iso) return null;
  // Parse-once: dropped into the traffic-light comparison AND the strict
  // formatter; a bad ISO would otherwise silently render "just now".
  const submittedAt = new Date(iso);
  if (Number.isNaN(submittedAt.getTime())) return null;

  const label = formatDistanceToNowStrict(submittedAt, { addSuffix: true });

  // Traffic-light thresholds are wall-clock, not business hours — the ticket
  // treats a Sunday-submitted KYC the same as a Tuesday one.
  const hours = (Date.now() - submittedAt.getTime()) / (1000 * 60 * 60);
  const dotColour = hours <= 24 ? "bg-green-500" : hours <= 72 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
      {showDot && (
        <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${dotColour}`} />
      )}
      <span className="tabular-nums">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVC-308: AI-verdict rendering helpers
// ---------------------------------------------------------------------------

/**
 * Machine flag codes → human strings. Kept as a plain map (not a switch) so
 * a code the frontend hasn't been taught yet degrades to its raw form —
 * `"unknown_flag"` renders as "unknown_flag" rather than blocking the sheet.
 *
 * Extend as SVC-307 adds new codes.
 */
export const KYC_FLAG_LABELS: Record<string, string> = {
  name_mismatch: "Name on Aadhaar doesn't match provider's stated name",
  dob_mismatch: "Date of birth on Aadhaar doesn't match provider's stated DOB",
  blurred_selfie: "Selfie is blurred — face landmarks not extractable",
  blurred_aadhaar: "Aadhaar photo is blurred — text OCR failed",
  face_mismatch: "Face on selfie doesn't match the Aadhaar photo",
  selfie_not_live: "Selfie appears to be a photo of a photo, not a live capture",
  aadhaar_expired: "Aadhaar image looks tampered / expired format",
  underage: "Extracted DOB puts the provider under 18",
  low_ocr_confidence: "OCR confidence too low to trust extracted fields",
};

export const humanFlag = (code: string): string => KYC_FLAG_LABELS[code] ?? code;

interface VerdictBadgeSpec {
  label: string;
  // Raw Tailwind classes — the shadcn Badge only ships 4 variants and we need
  // green/amber/red/grey pills that don't correspond to `default | secondary
  // | destructive | outline`. Rendering as a plain span with these classes
  // keeps the design consistent with the traffic-light dots elsewhere in the
  // route (bg-green-500/bg-yellow-500/bg-red-500).
  className: string;
}

/**
 * Verdict → pill spec. `null` verdict (old submissions predating SVC-307)
 * gets the grey "unavailable" pill; the caller hides the extracted-fields
 * table in that case.
 */
export function verdictBadge(verdict: API_KYCVerdict | null): VerdictBadgeSpec {
  if (!verdict) {
    return {
      label: "AI: unavailable",
      className: "bg-secondary text-secondary-foreground",
    };
  }
  const topFlag = verdict.flags[0];
  switch (verdict.outcome) {
    case "auto_approve":
      return {
        label: "AI: Auto-approved",
        className: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
      };
    case "needs_review":
      return {
        label: topFlag ? `AI: Needs review — ${humanFlag(topFlag)}` : "AI: Needs review",
        className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
      };
    case "reject":
      return {
        label: topFlag ? `AI: Rejected — ${humanFlag(topFlag)}` : "AI: Rejected",
        className: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
      };
  }
}

/** Confidence 0..1 → 0..100 clamped, so an out-of-range value from a future
 *  model doesn't blow out the bar. */
export const confidencePct = (c: number): number => Math.max(0, Math.min(100, Math.round(c * 100)));

/** Normalize a stated-vs-extracted comparison. Lowercased, punctuation-stripped,
 *  whitespace-collapsed — enough to catch "Jane Q. Doe" vs "jane q doe" without
 *  false-flagging a genuine mismatch as an OCR whitespace quirk. Either value
 *  being null/blank is NOT a mismatch, because we render "—" for the unknown
 *  side rather than compare it. */
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

function AiAnalysisSection({
  verdict,
  providerStatedName,
  providerStatedDob,
}: {
  verdict: API_KYCVerdict | null;
  providerStatedName: string | null;
  providerStatedDob: string | null;
}) {
  const badge = verdictBadge(verdict);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">AI Analysis</p>
      </div>

      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}
      >
        {badge.label}
      </span>

      {!verdict && (
        <p className="mt-3 text-xs text-muted-foreground">
          Submitted before AI verification was live — the reviewer decides on the docs alone.
        </p>
      )}

      {verdict && (
        <>
          <ConfidenceBar value={verdict.confidence} />
          <FlagsList flags={verdict.flags} />
          <ComparisonTable
            verdict={verdict}
            providerStatedName={providerStatedName}
            providerStatedDob={providerStatedDob}
          />
        </>
      )}
    </section>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = confidencePct(value);
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>Confidence</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="AI confidence"
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FlagsList({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-1 text-xs font-medium text-foreground">Flags</p>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        {flags.map((f) => (
          <li key={f}>{humanFlag(f)}</li>
        ))}
      </ul>
    </div>
  );
}

function ComparisonTable({
  verdict,
  providerStatedName,
  providerStatedDob,
}: {
  verdict: API_KYCVerdict;
  providerStatedName: string | null;
  providerStatedDob: string | null;
}) {
  const extractedName = verdict.extracted.name_en;
  const extractedDob = verdict.extracted.dob;
  const nameMismatch = looksMismatched(providerStatedName, extractedName);
  const dobMismatch = looksMismatched(providerStatedDob, extractedDob);

  return (
    // `overflow-wrap: anywhere` on every cell (SVC-355): the sheet leaves this
    // table 256px on a 340px phone. Ordinary values fit, but one long unbroken
    // word (a long name in capitals) widened it to ~406px and the wrapper
    // clipped the AI-extracted column. `break-words` would not help: it leaves
    // the cell's min-content width alone, and that width is what overflows.
    <div className="mt-4 overflow-hidden rounded-lg border border-border">
      <table className="w-full text-xs [&_td]:[overflow-wrap:anywhere] [&_th]:[overflow-wrap:anywhere]">
        <thead className="bg-secondary/40 text-left uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Provider stated</th>
            <th className="px-3 py-2 font-medium">AI extracted</th>
          </tr>
        </thead>
        <tbody>
          <ComparisonRow
            field="Name"
            stated={providerStatedName}
            extracted={extractedName}
            mismatch={nameMismatch}
          />
          <ComparisonRow
            field="DOB"
            stated={providerStatedDob}
            extracted={extractedDob}
            mismatch={dobMismatch}
          />
          <ComparisonRow
            field="Aadhaar #"
            stated={null}
            extracted={
              verdict.extracted.aadhaar_last4
                ? `XXXX-XXXX-${verdict.extracted.aadhaar_last4}`
                : null
            }
            mismatch={false}
          />
          <AddressRow address={verdict.extracted.address} />
        </tbody>
      </table>
    </div>
  );
}

function ComparisonRow({
  field,
  stated,
  extracted,
  mismatch,
}: {
  field: string;
  stated: string | null;
  extracted: string | null;
  mismatch: boolean;
}) {
  // The ticket calls for amber-100 on mismatched cells — highlight the
  // *stated* and *extracted* cells only, not the field-name column.
  const cellCls = mismatch ? "bg-amber-100 dark:bg-amber-950/40" : "";
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-medium text-foreground">{field}</td>
      <td className={`px-3 py-2 ${cellCls}`}>{stated ?? "—"}</td>
      <td className={`px-3 py-2 ${cellCls}`}>{extracted ?? "—"}</td>
    </tr>
  );
}

function AddressRow({ address }: { address: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!address) {
    return (
      <tr className="border-t border-border">
        <td className="px-3 py-2 font-medium text-foreground">Address</td>
        <td className="px-3 py-2">—</td>
        <td className="px-3 py-2">—</td>
      </tr>
    );
  }
  // Truncation threshold picked to fit two lines on the mobile-width sheet
  // without letting a paragraph-length address dominate the section. Tap the
  // cell to expand; there's no per-address preference to persist.
  const TRUNCATE_AT = 60;
  const needsTruncate = address.length > TRUNCATE_AT;
  const shown = expanded || !needsTruncate ? address : `${address.slice(0, TRUNCATE_AT)}…`;
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-medium text-foreground">Address</td>
      <td className="px-3 py-2">—</td>
      <td className="px-3 py-2">
        {needsTruncate ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-left"
            aria-expanded={expanded}
          >
            {shown}
            <span className="ml-1 text-primary">{expanded ? "less" : "more"}</span>
          </button>
        ) : (
          shown
        )}
      </td>
    </tr>
  );
}

function ReviewSheet({
  userId,
  readOnly,
  variant,
  onClose,
}: {
  userId: string | null;
  readOnly: boolean;
  variant: TabKey;
  onClose: () => void;
}) {
  const { data: review, isLoading, isError } = useKYCReview(userId);
  const verify = useVerifyKYC();
  const reject = useRejectKYC();
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  // Reset transient state when the sheet's target changes (or closes).
  const handleClose = () => {
    setReason("");
    setShowReject(false);
    onClose();
  };

  const handleApprove = () => {
    if (!userId) return;
    verify.mutate(userId, {
      onSuccess: () => {
        toast.success("KYC verified");
        handleClose();
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to verify"),
    });
  };

  const handleReject = () => {
    if (!userId) return;
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      toast.error("Please enter a reason");
      return;
    }
    reject.mutate(
      { userId, reason: trimmed },
      {
        onSuccess: () => {
          toast.success("KYC rejected — provider notified");
          handleClose();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to reject"),
      },
    );
  };

  const busy = verify.isPending || reject.isPending;

  const sheetTitle =
    variant === "rejected"
      ? "Rejected KYC"
      : variant === "auto-approved"
        ? "Auto-approved KYC"
        : "Review KYC";

  return (
    <Sheet open={userId !== null} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{sheetTitle}</SheetTitle>
          <SheetDescription>
            {review?.name ? `${review.name} — ${review.phone}` : (review?.phone ?? "Loading…")}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {isError && (
          <p className="mt-6 text-sm text-destructive">
            Couldn't load this provider's documents. Close and try again.
          </p>
        )}

        {review && !isLoading && !isError && (
          <div className="mt-6 space-y-6">
            {readOnly && variant === "rejected" && review.kyc_rejection_reason && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">Rejection reason</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {review.kyc_rejection_reason}
                </p>
                {review.kyc_reviewed_at && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Rejected{" "}
                    {formatDistanceToNowStrict(new Date(review.kyc_reviewed_at), {
                      addSuffix: true,
                    })}
                  </p>
                )}
              </div>
            )}

            {readOnly && variant === "auto-approved" && review.kyc_reviewed_at && (
              // Not a rejection banner — flip the tone. The AI approved this
              // provider without a human touching it; the reviewer is here to
              // sanity-check that decision.
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  Auto-approved by AI
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDistanceToNowStrict(new Date(review.kyc_reviewed_at), {
                    addSuffix: true,
                  })}{" "}
                  · no human review
                </p>
              </div>
            )}

            <AiAnalysisSection
              verdict={review.ai_verdict}
              providerStatedName={review.name}
              providerStatedDob={review.provider_stated_dob}
            />

            <DocPreview label="Aadhaar" url={review.aadhaar_url} />
            <DocPreview label="Selfie" url={review.selfie_url} />

            {!readOnly && !showReject && (
              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => setShowReject(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <Button className="flex-1" disabled={busy} onClick={handleApprove}>
                  {verify.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve
                    </>
                  )}
                </Button>
              </div>
            )}

            {!readOnly && showReject && (
              <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
                <p className="text-sm font-medium text-foreground">Reason for rejection</p>
                <Textarea
                  placeholder="e.g. Aadhaar photo is blurred — please re-upload"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">
                  Shown to the provider so they know how to fix and re-submit.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowReject(false);
                      setReason("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={busy}
                    onClick={handleReject}
                  >
                    {reject.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Confirm rejection"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DocPreview({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-6 text-center">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">Not uploaded yet.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {/* Presigned URLs are 1h TTL; if the sheet sits open longer the image
          will fail to load — admin re-opens the row to re-mint. */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-lg border border-border"
      >
        <img src={url} alt={label} className="h-auto w-full object-contain" />
      </a>
    </div>
  );
}

// Verdict fixtures for local development against SVC-308 before SVC-307 lands.
// Kept next to the route so the fixture shape lives with its consumer and stays
// in sync when the backend PR merges. Also imported by admin.kyc.test.tsx.
export const KYC_VERDICT_FIXTURES: {
  auto_approve: API_KYCVerdict;
  needs_review: API_KYCVerdict;
  reject: API_KYCVerdict;
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
    raw_response: {},
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
    raw_response: {},
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
    raw_response: {},
  },
};
