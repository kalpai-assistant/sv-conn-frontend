/**
 * The right-hand pane: one row's documents, AI verdict and actions. It's keyed by
 * row, so a half-typed reject reason can never carry over to another person.
 */
import { useId, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { KycAiAnalysis } from "@/components/kyc/KycAiAnalysis";
import { KycDocuments } from "@/components/kyc/KycDocuments";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  KYC_REASON_MAX,
  checkRejectReason,
  formatKycAge,
  kycDisplayName,
  kycReviewPath,
  kycStatusLabel,
  type KycDetail,
  type KycQueueRow,
  type KycStatus,
  type KycTab,
} from "@/lib/kyc";
import { useApiGet } from "@/lib/use-api-get";

export type KycAction = "approve" | "reject";

/** "stale" means the server says this row has moved on, so what's on screen is out of date. */
export type KycActionOutcome = "done" | "stale" | "failed";

const STATUS_PILL: Record<KycStatus, string> = {
  pending: "bg-secondary text-secondary-foreground",
  submitted: "bg-secondary text-secondary-foreground",
  verified: "bg-success/15 text-foreground",
  rejected: "bg-destructive/15 text-foreground",
};

export function KycStatusPill({ status }: { status: KycStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[status]}`}
    >
      {kycStatusLabel(status)}
    </span>
  );
}

function RejectionBanner({ detail }: { detail: KycDetail }) {
  const age = formatKycAge(detail.kyc_reviewed_at);
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-destructive">Rejection reason</p>
      <p className="mt-1 text-sm whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
        {detail.kyc_rejection_reason}
      </p>
      {age && <p className="mt-2 text-xs text-muted-foreground">Rejected {age}</p>}
    </div>
  );
}

function AutoApprovedBanner({ reviewedAt }: { reviewedAt: string | null }) {
  const age = formatKycAge(reviewedAt);
  return (
    <div className="rounded-lg border border-success/40 bg-success/10 p-4">
      <p className="text-sm font-medium text-foreground">Auto-approved by AI</p>
      {age && <p className="mt-1 text-xs text-muted-foreground">{age} · no human review</p>}
    </div>
  );
}

export function KycDetailPane({
  row,
  tab,
  canAct,
  running,
  busy,
  onAction,
}: {
  row: KycQueueRow;
  tab: KycTab;
  canAct: boolean;
  /** What's running for this row, if anything. */
  running: KycAction | null;
  /** True while any row's action is running: only one runs at a time. */
  busy: boolean;
  onAction: (row: KycQueueRow, action: KycAction, reason?: string) => Promise<KycActionOutcome>;
}) {
  const detail = useApiGet<KycDetail>(kycReviewPath(row));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const reasonId = useId();
  const hintId = useId();
  const errorId = useId();

  async function act(action: KycAction, text?: string) {
    const outcome = await onAction(row, action, text);
    // If another row was selected meanwhile, this pane is gone and this does nothing.
    if (outcome === "stale") {
      setRejecting(false);
      detail.refresh();
    }
  }

  function submitReject() {
    const checked = checkRejectReason(reason);
    if (!checked.ok) {
      setReasonError(checked.error);
      return;
    }
    setReasonError(null);
    void act("reject", checked.reason);
  }

  function cancelReject() {
    setRejecting(false);
    setReason("");
    setReasonError(null);
  }

  const data = detail.status === "ready" ? detail.data : null;
  const owner = row.name ? `${row.name}, ${row.phone}` : row.phone;

  return (
    <div className="space-y-5 rounded-lg border bg-card p-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere]">
            {kycDisplayName(row)}
          </h2>
          <KycStatusPill status={data?.kyc_status ?? row.kyc_status} />
        </div>
        <p className="text-sm text-muted-foreground">{row.phone}</p>
        {row.kind === "pro" && (
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            Team Pro{row.sp_business_name ? ` · ${row.sp_business_name}` : ""}
          </p>
        )}
      </header>

      {detail.status === "loading" && <LoadingState rows={4} />}
      {detail.status === "error" && (
        <ErrorState message="Couldn't load this provider's documents." onRetry={detail.retry} />
      )}

      {data && (
        <>
          {data.kyc_status === "rejected" && data.kyc_rejection_reason && (
            <RejectionBanner detail={data} />
          )}
          {/* Auto-approved isn't a status: the row is verified, and only the
              Auto-approved filter knows the AI did it. */}
          {tab === "auto-approved" && data.kyc_status === "verified" && (
            <AutoApprovedBanner reviewedAt={data.kyc_reviewed_at} />
          )}

          <KycAiAnalysis verdict={data.ai_verdict} statedName={data.name} />
          <KycDocuments detail={data} owner={owner} onRetry={detail.refresh} />

          {data.kyc_status === "submitted" && !canAct && (
            <p className="text-sm text-muted-foreground">
              Read-only: your role can't approve or reject.
            </p>
          )}

          {data.kyc_status === "submitted" && canAct && !rejecting && (
            <div className="flex gap-3">
              <Button
                variant="destructive"
                className="flex-1"
                disabled={busy}
                onClick={() => setRejecting(true)}
              >
                <XCircle />
                Reject
              </Button>
              <Button className="flex-1" disabled={busy} onClick={() => void act("approve")}>
                {running === "approve" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Approve
              </Button>
            </div>
          )}

          {data.kyc_status === "submitted" && canAct && rejecting && (
            <div className="space-y-3 rounded-lg border bg-secondary/30 p-4">
              <Label htmlFor={reasonId}>Reason for rejection</Label>
              <Textarea
                id={reasonId}
                placeholder="e.g. Aadhaar photo is blurred — please re-upload"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setReasonError(null);
                }}
                rows={3}
                maxLength={KYC_REASON_MAX}
                aria-invalid={reasonError !== null}
                aria-describedby={reasonError ? `${errorId} ${hintId}` : hintId}
              />
              {reasonError && (
                <p id={errorId} role="alert" className="text-sm text-destructive">
                  {reasonError}
                </p>
              )}
              <p id={hintId} className="text-xs text-muted-foreground">
                Shown to the provider so they know how to fix and re-submit.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" disabled={busy} onClick={cancelReject}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={busy}
                  onClick={submitReject}
                >
                  {running === "reject" && <Loader2 className="animate-spin" />}
                  Confirm rejection
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
