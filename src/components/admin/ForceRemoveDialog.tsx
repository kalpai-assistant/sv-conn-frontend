/**
 * Force-remove a Pro from their owner's team (SVC-329): the owner's own soft
 * remove, done by admin, e.g. when the owner is unresponsive. The Pro keeps
 * their history; the row is marked removed. Reason required, and audited.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, UserMinus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAdminForceRemovePro, type API_AdminTeamPro } from "@/hooks/useApi";
import { REASON_MAX, forceRemoveErrorCopy, isActiveJobError, reasonError } from "@/lib/admin-team";

export function ForceRemoveDialog({
  pro,
  onClose,
}: {
  /** The member to remove; null keeps the dialog closed. */
  pro: API_AdminTeamPro | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<{ copy: string; activeJob: boolean } | null>(null);
  const [done, setDone] = useState<{ selfReenabled: boolean } | null>(null);
  const remove = useAdminForceRemovePro();
  const busy = remove.isPending;

  const close = () => {
    if (busy) return;
    setReason("");
    setError(null);
    setDone(null);
    onClose();
  };

  const submit = () => {
    if (!pro) return;
    const invalid = reasonError(reason);
    if (invalid) {
      setError({ copy: invalid, activeJob: false });
      return;
    }
    setError(null);
    remove.mutate(
      { professionalId: pro.id, reason: reason.trim() },
      {
        onSuccess: (res) => setDone({ selfReenabled: res.self_reenabled }),
        onError: (err) =>
          setError({ copy: forceRemoveErrorCopy(err), activeJob: isActiveJobError(err) }),
      },
    );
  };

  return (
    <AlertDialog open={pro !== null} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent>
        {done ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{pro?.display_name} was removed</AlertDialogTitle>
              <AlertDialogDescription>
                They're marked removed on this team and keep their job history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p className="rounded-lg border border-border bg-secondary/30 p-3 text-sm text-foreground">
              {done.selfReenabled
                ? "The owner had switched off taking jobs themselves. With no other active member left, they've been switched back on, so they get jobs again."
                : "The owner's own job setting is unchanged."}
            </p>
            <AlertDialogFooter>
              <AlertDialogAction onClick={close}>Done</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {pro?.display_name} from this team?</AlertDialogTitle>
              <AlertDialogDescription>
                The same removal the owner can do: they lose access to this team and stop getting
                its jobs. Their row stays, marked removed, with its job history. If they're the
                owner's last member and the owner had switched off taking jobs themselves, that is
                switched back on.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2">
              <label htmlFor="force-remove-reason" className="text-sm font-medium text-foreground">
                Reason (required)
              </label>
              <Textarea
                id="force-remove-reason"
                placeholder="e.g. Left the business in September; owner unreachable"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={REASON_MAX}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">Saved to the admin audit history.</p>
            </div>

            {error && (
              <div
                role="alert"
                className="space-y-2 rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive"
              >
                <p>{error.copy}</p>
                {error.activeJob && (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/admin/bookings">Open Bookings</Link>
                  </Button>
                )}
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Keep on team</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-label="Removing" />
                ) : (
                  <>
                    <UserMinus className="mr-2 h-4 w-4" />
                    Remove
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
