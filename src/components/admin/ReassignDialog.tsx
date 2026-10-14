/**
 * Move a person to another owner's team by admin authority (SVC-329): no
 * invite, no accept by either party. For mergers and support cases.
 *
 * KYC never moves with them (Option A, decided 2026-10-10): KYC lives on the
 * per-owner row. Under the new owner they start "KYC pending", unless they
 * were on that owner's team before, in which case that earlier row comes back
 * with its own KYC. The backend decides which; the confirm step explains both,
 * and the success step says which one happened.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRightLeft, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActiveJobLink } from "@/components/admin/ActiveJobLink";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { KycBadge } from "@/components/admin/KycBadge";
import {
  useAdminProviderSearch,
  useAdminReassignPro,
  type API_AdminProviderRow,
  type API_AdminTeamPro,
  type API_ReassignResponse,
} from "@/hooks/useApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  KYC_LABEL,
  REASON_MAX,
  activeJobLink,
  ownerLabel,
  reasonError,
  reassignErrorCopy,
  reassignTargetBlock,
} from "@/lib/admin-team";

export function ReassignDialog({
  pro,
  onClose,
}: {
  /** The member to move; null keeps the dialog closed. */
  pro: API_AdminTeamPro | null;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<API_AdminProviderRow | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<{
    copy: string;
    activeJob: { bookingId: string | null } | null;
  } | null>(null);
  const [done, setDone] = useState<API_ReassignResponse | null>(null);
  const reassign = useAdminReassignPro();
  const busy = reassign.isPending;

  const close = () => {
    if (busy) return;
    setTarget(null);
    setReason("");
    setError(null);
    setDone(null);
    onClose();
  };

  const submit = () => {
    if (!pro) return;
    if (!target) {
      setError({ copy: "Pick the owner to move them to.", activeJob: null });
      return;
    }
    const invalid = reasonError(reason);
    if (invalid) {
      setError({ copy: invalid, activeJob: null });
      return;
    }
    setError(null);
    reassign.mutate(
      { professionalId: pro.id, targetSpUserId: target.user_id, reason: reason.trim() },
      {
        onSuccess: setDone,
        onError: (err) => setError({ copy: reassignErrorCopy(err), activeJob: activeJobLink(err) }),
      },
    );
  };

  const name = pro?.display_name ?? "This member";
  const targetName = target ? ownerLabel(target) : "the new owner";

  return (
    <Dialog open={pro !== null} onOpenChange={(o) => !o && close()}>
      {/* minmax(0, 1fr) (SVC-355): DialogContent is a grid, and its default
          track grows to the widest child's min-content. A long owner label in
          the picker made it ~408px on a 340px phone, clipping the "KYC not
          verified" / "Current team" labels and the KYC warning, because the
          label's `truncate` never got a narrower box to cut against. */}
      <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {name} moved to {targetName}
              </DialogTitle>
              <DialogDescription>
                They're marked removed on the old team and start offline on the new one.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3 text-sm text-foreground">
              <p>
                {done.reactivated
                  ? `They were on this owner's team before, so that row is back with its own KYC: ${KYC_LABEL[done.professional.kyc_status] ?? done.professional.kyc_status}.`
                  : "They start KYC pending under the new owner."}
              </p>
              {done.self_reenabled && (
                <p>
                  The old owner had switched off taking jobs themselves. With no other active member
                  left, they've been switched back on.
                </p>
              )}
            </div>
            <DialogFooter>
              {target && (
                <Button asChild variant="outline">
                  <Link
                    to="/admin/teams/$spUserId"
                    params={{ spUserId: target.user_id }}
                    onClick={close}
                  >
                    Open the new team
                  </Link>
                </Button>
              )}
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Move {name} to another team</DialogTitle>
              <DialogDescription>
                No invite or accept is needed. They leave this team (marked removed, history kept)
                and join the owner you pick.
              </DialogDescription>
            </DialogHeader>

            {pro && (
              <OwnerPicker
                fromSpUserId={pro.service_provider_id}
                selected={target}
                onSelect={(row) => {
                  setTarget(row);
                  setError(null);
                }}
                disabled={busy}
              />
            )}

            <div
              data-testid="kyc-outcome"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <p className="font-medium">KYC doesn't move with them.</p>
              <p className="mt-1">
                Under {targetName} they start <strong>KYC pending</strong>, unless they were on{" "}
                {targetName}'s team before. Then that earlier row comes back with its own KYC
                status. Their KYC on this team stays on this team's removed row.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="reassign-reason" className="text-sm font-medium text-foreground">
                Reason (required)
              </label>
              <Textarea
                id="reassign-reason"
                placeholder="e.g. Business merged into the new owner's"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={REASON_MAX}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">Saved to both owners' audit history.</p>
            </div>

            {error && (
              <div
                role="alert"
                className="space-y-2 rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive"
              >
                <p>{error.copy}</p>
                {error.activeJob && <ActiveJobLink bookingId={error.activeJob.bookingId} />}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-label="Moving" />
                ) : (
                  <>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Move
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The same owner search as /admin/teams, as a pick list. Owners the backend
 *  would refuse are shown but can't be picked, with the reason. */
function OwnerPicker({
  fromSpUserId,
  selected,
  onSelect,
  disabled,
}: {
  fromSpUserId: string;
  selected: API_AdminProviderRow | null;
  onSelect: (row: API_AdminProviderRow) => void;
  disabled: boolean;
}) {
  const [q, setQ] = useState("");
  const search = useAdminProviderSearch(useDebouncedValue(q));
  const rows = search.data?.pages.flat() ?? [];

  return (
    <div className="space-y-2">
      <label htmlFor="reassign-owner-search" className="text-sm font-medium text-foreground">
        New owner
      </label>
      <Input
        id="reassign-owner-search"
        placeholder="Search by phone, name or business"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={disabled}
      />
      <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
        {search.isLoading && <Skeleton className="m-2 h-10" />}
        {search.isError && <p className="p-3 text-sm text-destructive">Couldn't search owners.</p>}
        {!search.isLoading && !search.isError && rows.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No owners match.</p>
        )}
        <ul>
          {rows.map((row) => {
            const block = reassignTargetBlock(row, fromSpUserId);
            const isSelected = selected?.user_id === row.user_id;
            return (
              <li key={row.user_id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  disabled={disabled || block !== null}
                  onClick={() => onSelect(row)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    isSelected ? "bg-primary/10" : "hover:bg-secondary/40"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{ownerLabel(row)}</span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {row.phone}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {block ? (
                      <span className="text-xs text-muted-foreground">{block}</span>
                    ) : (
                      <KycBadge status={row.kyc_status} />
                    )}
                    {isSelected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {search.hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={search.isFetchingNextPage}
            onClick={() => search.fetchNextPage()}
          >
            {search.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
          </Button>
        )}
      </div>
    </div>
  );
}
