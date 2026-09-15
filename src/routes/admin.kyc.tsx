/**
 * Admin KYC review page (SVC-90, SVC-298).
 *
 * Two-tab layout: Pending (default) shows providers awaiting review; Rejected
 * shows past rejections with reason + reviewed-at age for lookup. Tab state
 * lives in the URL (`?tab=rejected`) so a refresh keeps the reviewer where
 * they were.
 *
 * Tapping any row opens the same side sheet:
 *   - Pending row → Approve / Reject actions (as before).
 *   - Rejected row → read-only; the rejection reason is surfaced prominently.
 *
 * Auth: gated by admin role via the AppGate in __root.tsx.
 */
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { CheckCircle2, ChevronRight, Loader2, ShieldCheck, XCircle } from "lucide-react";
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
  type KYCQueueStatus,
} from "@/hooks/useApi";

const searchSchema = z.object({
  tab: z.enum(["pending", "rejected"]).optional(),
});

export const Route = createFileRoute("/admin/kyc")({
  component: AdminKYCReviewPage,
  validateSearch: searchSchema,
});

function AdminKYCReviewPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab } = useSearch({ from: Route.fullPath });
  const activeTab: "pending" | "rejected" = tab === "rejected" ? "rejected" : "pending";
  const status: KYCQueueStatus = activeTab === "rejected" ? "rejected" : "submitted";

  const { data: rows, isLoading, isError, refetch } = useKYCQueue(status);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const setTab = (next: "pending" | "rejected") => {
    // Drop the search key entirely for the default so we don't leave a stale
    // `?tab=pending` in the URL — cleaner shareable link.
    navigate({ search: next === "pending" ? {} : { tab: "rejected" } });
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">KYC review queue</h1>
          <p className="text-sm text-muted-foreground">
            {activeTab === "pending"
              ? "Providers waiting for verification. Tap a row to review their documents."
              : "Past rejections — read-only. Tap a row to look up the rejection reason."}
          </p>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setTab(v as "pending" | "rejected")}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
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
          <p className="text-sm font-medium text-foreground">
            {activeTab === "pending" ? "No pending reviews." : "No rejections yet."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeTab === "pending"
              ? "All caught up. Newly submitted KYCs will appear here."
              : "Rejected KYCs will appear here for reference."}
          </p>
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

      <div className="mt-6">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
          ← Back home
        </Button>
      </div>

      <ReviewSheet
        userId={selectedUserId}
        readOnly={activeTab === "rejected"}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}

function QueueRow({ row, variant }: { row: API_KYCQueueRow; variant: "pending" | "rejected" }) {
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

function ReviewSheet({
  userId,
  readOnly,
  onClose,
}: {
  userId: string | null;
  readOnly: boolean;
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

  return (
    <Sheet open={userId !== null} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{readOnly ? "Rejected KYC" : "Review KYC"}</SheetTitle>
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
            {readOnly && review.kyc_rejection_reason && (
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
