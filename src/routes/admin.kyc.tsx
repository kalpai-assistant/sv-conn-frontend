/**
 * Admin KYC review page (SVC-90).
 *
 * Lists providers awaiting KYC approval. Tapping a row opens a side sheet with
 * the full payload — including the presigned Aadhaar + selfie URLs from SVC-87
 * — and Approve / Reject actions.
 *
 * Beta scope:
 * - No pagination beyond what the backend returns (capped at 200 server-side)
 * - Reject reason is a single textarea, no canned reasons yet
 * - Doc viewer is a plain <img>; no zoom/rotation
 *
 * Auth: gated by admin role via the AppGate in __root.tsx.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  usePendingKYC,
  useKYCReview,
  useVerifyKYC,
  useRejectKYC,
  type API_PendingKYCUser,
} from "@/hooks/useApi";

export const Route = createFileRoute("/admin/kyc")({
  component: AdminKYCReviewPage,
});

function AdminKYCReviewPage() {
  const navigate = useNavigate();
  const { data: pending, isLoading, isError, refetch } = usePendingKYC();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">KYC review queue</h1>
          <p className="text-sm text-muted-foreground">
            Providers waiting for verification. Tap a row to review their documents.
          </p>
        </div>
      </header>

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

      {!isLoading && !isError && pending && pending.length === 0 && (
        <div className="rounded-lg border border-border bg-secondary/30 p-8 text-center">
          <p className="text-sm font-medium text-foreground">No pending reviews.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            All caught up. Newly submitted KYCs will appear here.
          </p>
        </div>
      )}

      {!isLoading && pending && pending.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {pending.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setSelectedUserId(row.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
              >
                <PendingRow row={row} />
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

      <ReviewSheet userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
    </div>
  );
}

function PendingRow({ row }: { row: API_PendingKYCUser }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">{row.name ?? "(no name yet)"}</p>
      <p className="truncate text-xs text-muted-foreground">{row.phone}</p>
    </div>
  );
}

function ReviewSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
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
          <SheetTitle>Review KYC</SheetTitle>
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
            <DocPreview label="Aadhaar" url={review.aadhaar_url} />
            <DocPreview label="Selfie" url={review.selfie_url} />

            {!showReject && (
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

            {showReject && (
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
