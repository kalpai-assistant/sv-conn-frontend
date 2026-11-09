/**
 * Force remove a Pro from their SP's team (SVC-329, here SVC-427): the SP's own
 * soft remove, done by admin, e.g. when the SP is unresponsive. The row stays,
 * marked removed, with its job history. Audited as pro_force_removed.
 */
import { useId, useRef, useState, type FormEvent } from "react";
import { ActiveJobLink } from "@/components/teams/ActiveJobLink";
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
import { apiFetch } from "@/lib/api";
import {
  REASON_MAX,
  activeJobId,
  checkReason,
  forceRemoveErrorCopy,
  forceRemovePath,
  type ForceRemoveResult,
  type TeamPro,
} from "@/lib/teams";

type Refusal = { text: string; jobId: string | null | undefined };

export function ForceRemoveDialog({
  pro,
  onClose,
  onRemoved,
}: {
  /** The Pro to remove; null keeps the dialog closed. */
  pro: Pick<TeamPro, "id" | "display_name"> | null;
  onClose: () => void;
  /** After a 200, with what the page should say. */
  onRemoved: (message: string) => void;
}) {
  const reasonId = useId();
  const hintId = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  // State updates a render late, and a double click is quicker than that.
  const inFlight = useRef(false);

  function close() {
    if (busy) return;
    setReason("");
    setRefusal(null);
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!pro || inFlight.current) return;
    const check = checkReason(reason);
    if (!check.ok) {
      setRefusal({ text: check.message, jobId: undefined });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      const result = await apiFetch<ForceRemoveResult>(forceRemovePath(pro.id), {
        method: "POST",
        body: JSON.stringify({ reason: check.reason }),
      });
      setReason("");
      onRemoved(
        result.self_reenabled
          ? `${pro.display_name} was removed. The SP had switched off taking jobs themselves; with no other active Pro left, that's switched back on.`
          : `${pro.display_name} was removed from the team.`,
      );
    } catch (error) {
      setRefusal({ text: forceRemoveErrorCopy(error), jobId: activeJobId(error) });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={pro !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)]">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Remove {pro?.display_name} from this team?</DialogTitle>
            <DialogDescription>
              The same removal the SP can do: they lose access to this team and stop getting its
              jobs. Their row stays, marked removed, with its job history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={reasonId}>Reason (required)</Label>
            <Textarea
              id={reasonId}
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              aria-describedby={hintId}
              placeholder="e.g. Left the business in September; SP unreachable"
              onChange={(event) => {
                setReason(event.target.value);
                setRefusal(null);
              }}
            />
            <p id={hintId} className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span>Saved to the SP&apos;s admin history.</span>
              <span className="tabular-nums">
                {reason.trim().length}/{REASON_MAX}
              </span>
            </p>
          </div>

          {refusal && (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive [overflow-wrap:anywhere]"
            >
              <p>{refusal.text}</p>
              {refusal.jobId !== undefined && <ActiveJobLink bookingId={refusal.jobId} />}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              Keep on team
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? "Removing…" : "Force remove"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
