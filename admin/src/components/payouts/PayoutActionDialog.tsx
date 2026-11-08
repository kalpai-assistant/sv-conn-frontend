/**
 * The confirm step for the three money actions: Pay out and the two re-queues.
 * Each is audited by the backend (payout.enqueue, payout.requeue_failed,
 * payout.requeue_reversed). Nothing closes the dialog mid-call.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PayoutActionDialogProps {
  title: string;
  /** The one-line summary a screen reader reads with the title. */
  description: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  destructive?: boolean;
  busy: boolean;
  /** An error that keeps the dialog open: a failed call the admin can try again. */
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PayoutActionDialog({
  title,
  description,
  children,
  confirmLabel,
  busyLabel,
  destructive = false,
  busy,
  error,
  onCancel,
  onConfirm,
}: PayoutActionDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">{title}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">{description}</DialogDescription>
        </DialogHeader>
        {children && <div className="space-y-3 text-sm [overflow-wrap:anywhere]">{children}</div>}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive [overflow-wrap:anywhere]"
          >
            {error}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
