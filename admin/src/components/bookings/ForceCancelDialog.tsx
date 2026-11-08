/**
 * The one write on this screen (Tushar's call, 2026-11-08): the ticket asked for
 * none, but SVC-434 removes legacy's force cancel and SVC-433 doesn't add one.
 * The backend audits it as booking.force_cancel.
 */
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CANCEL_REASON_MAX,
  checkCancelReason,
  refundCopy,
  shortId,
  type Booking,
} from "@/lib/bookings";

interface ForceCancelDialogProps {
  booking: Booking;
  open: boolean;
  busy: boolean;
  /** An error that keeps the dialog open: a failed call the admin can try again. */
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}

export function ForceCancelDialog({
  booking,
  open,
  busy,
  error,
  onOpenChange,
  onConfirm,
}: ForceCancelDialogProps) {
  const reasonId = useId();
  const hintId = useId();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const length = reason.trim().length;

  function submit(event: FormEvent) {
    event.preventDefault();
    const check = checkCancelReason(reason);
    if (!check.ok) {
      setProblem(check.message);
      return;
    }
    setProblem(null);
    onConfirm(check.reason);
  }

  const shown = problem ?? error;

  // Nothing closes it mid-call, and a closed dialog forgets what was typed.
  function changeOpen(next: boolean) {
    if (busy) return;
    if (!next) {
      setReason("");
      setProblem(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Force cancel booking {shortId(booking.id)}?</DialogTitle>
            <DialogDescription>
              {refundCopy(booking)}{" "}
              {booking.provider_id
                ? "The customer and the provider are notified."
                : "The customer is notified."}{" "}
              This can't be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={reasonId}>Reason (required)</Label>
            <Textarea
              id={reasonId}
              rows={3}
              maxLength={CANCEL_REASON_MAX}
              value={reason}
              disabled={busy}
              aria-describedby={hintId}
              aria-invalid={problem ? true : undefined}
              placeholder="e.g. Provider unreachable, customer asked us to cancel"
              onChange={(event) => {
                setReason(event.target.value);
                setProblem(null);
              }}
            />
            <p id={hintId} className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span>Saved on the booking and in the audit log.</span>
              <span className="tabular-nums">
                {length}/{CANCEL_REASON_MAX}
              </span>
            </p>
          </div>

          {shown && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive [overflow-wrap:anywhere]"
            >
              {shown}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => changeOpen(false)}
            >
              Keep booking
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? "Cancelling…" : "Force cancel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
