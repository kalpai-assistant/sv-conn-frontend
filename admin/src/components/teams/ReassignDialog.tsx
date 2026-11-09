/**
 * Move a Pro to another SP's team by admin authority (SVC-329, here SVC-427): no
 * invite, no accept. For mergers and support cases. This is the console's "team
 * add": there is no admin route that adds a person to a team any other way.
 *
 * KYC never moves with them: it lives on the per-SP row. Under the new SP they
 * start not submitted, unless they were on that SP's team before, in which case
 * that row comes back with its own KYC. The backend decides which; the success
 * step says which happened.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { ActiveJobLink } from "@/components/teams/ActiveJobLink";
import { KycStatusPill } from "@/components/teams/TeamBadges";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import {
  REASON_MAX,
  SEARCH_MIN,
  activeJobId,
  checkReason,
  kycLabel,
  reassignErrorCopy,
  reassignPath,
  reassignTargetBlock,
  reassignTargetsPath,
  spLabel,
  type ReassignResult,
  type SpRow,
  type TeamPro,
} from "@/lib/teams";
import { useApiGet } from "@/lib/use-api-get";

type Refusal = { text: string; jobId: string | null | undefined };

const SEARCH_DELAY_MS = 250;

export function ReassignDialog({
  pro,
  onClose,
  onMoved,
}: {
  /** The Pro to move; null keeps the dialog closed. */
  pro: Pick<TeamPro, "id" | "display_name" | "service_provider_id"> | null;
  onClose: () => void;
  /** After a 200: the page refetches what changed. The dialog stays on its success step. */
  onMoved: (result: ReassignResult) => void;
}) {
  const reasonId = useId();
  const [target, setTarget] = useState<SpRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [done, setDone] = useState<{ result: ReassignResult; target: SpRow } | null>(null);
  const inFlight = useRef(false);

  function close() {
    if (busy) return;
    setTarget(null);
    setReason("");
    setRefusal(null);
    setDone(null);
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!pro || inFlight.current) return;
    if (!target) {
      setRefusal({ text: "Pick the SP to move them to.", jobId: undefined });
      return;
    }
    const check = checkReason(reason);
    if (!check.ok) {
      setRefusal({ text: check.message, jobId: undefined });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      const result = await apiFetch<ReassignResult>(reassignPath(pro.id), {
        method: "POST",
        body: JSON.stringify({ target_sp_user_id: target.user_id, reason: check.reason }),
      });
      setDone({ result, target });
      onMoved(result);
    } catch (error) {
      setRefusal({ text: reassignErrorCopy(error), jobId: activeJobId(error) });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const name = pro?.display_name ?? "This Pro";

  return (
    <Dialog open={pro !== null} onOpenChange={(open) => !open && close()}>
      {/* minmax(0, 1fr) (SVC-355): DialogContent is a grid whose default track grows
          to the widest child, so a long SP label pushed the dialog off a phone. */}
      <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto [color-scheme:light_dark]">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {name} moved to {spLabel(done.target)}
              </DialogTitle>
              <DialogDescription>
                They&apos;re marked removed on the old team and start offline on the new one.
              </DialogDescription>
            </DialogHeader>
            <div
              role="status"
              className="space-y-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm"
            >
              <p>
                {done.result.reactivated
                  ? `They were on this SP's team before, so that row is back with its own KYC: ${kycLabel(done.result.professional.kyc_status)}.`
                  : "They start with KYC not submitted under the new SP."}
              </p>
              {done.result.self_reenabled && (
                <p>
                  The old SP had switched off taking jobs themselves. With no other active Pro left,
                  that&apos;s switched back on.
                </p>
              )}
            </div>
            <DialogFooter className="flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link
                  to="/operator/sps/$spId"
                  params={{ spId: done.target.user_id }}
                  onClick={close}
                >
                  Open the new SP
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link
                  to="/operator/pros/$proId"
                  params={{ proId: done.result.professional.id }}
                  onClick={close}
                >
                  Open their new Pro row
                </Link>
              </Button>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="min-w-0 space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Move {name} to another team</DialogTitle>
              <DialogDescription>
                No invite or accept is needed. They leave this team (marked removed, history kept)
                and join the SP you pick.
              </DialogDescription>
            </DialogHeader>

            {pro && (
              <TargetPicker
                fromSpId={pro.service_provider_id}
                selected={target}
                disabled={busy}
                onSelect={(row) => {
                  setTarget(row);
                  setRefusal(null);
                }}
              />
            )}

            <div
              data-testid="kyc-outcome"
              className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm"
            >
              <p className="font-medium">KYC doesn&apos;t move with them.</p>
              <p className="mt-1 text-muted-foreground">
                Under the new SP they start with KYC not submitted, unless they were on that
                SP&apos;s team before. Then that earlier row comes back with its own KYC.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={reasonId}>Reason (required)</Label>
              <Textarea
                id={reasonId}
                rows={3}
                maxLength={REASON_MAX}
                value={reason}
                disabled={busy}
                placeholder="e.g. Business merged into the new SP's"
                onChange={(event) => {
                  setReason(event.target.value);
                  setRefusal(null);
                }}
              />
              <p className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>Saved to both SPs&apos; admin history.</span>
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
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Moving…" : "Move"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Only SPs the backend would accept: active and KYC-verified. The Pro's own SP can
 * come back too; it shows, but can't be picked.
 */
function TargetPicker({
  fromSpId,
  selected,
  disabled,
  onSelect,
}: {
  fromSpId: string;
  selected: SpRow | null;
  disabled: boolean;
  onSelect: (row: SpRow) => void;
}) {
  const inputId = useId();
  const [q, setQ] = useState("");
  const [sent, setSent] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSent(q), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [q]);
  const targets = useApiGet<SpRow[]>(reassignTargetsPath(sent));
  const rows = targets.status === "ready" ? targets.data : [];
  const short = q.trim().length > 0 && q.trim().length < SEARCH_MIN;

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={inputId}>New SP</Label>
      <Input
        id={inputId}
        autoComplete="off"
        placeholder="Search by phone, name or business"
        value={q}
        disabled={disabled}
        onChange={(event) => setQ(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        {short
          ? `Type at least ${SEARCH_MIN} characters to search.`
          : "Only active SPs with approved KYC can take a Pro."}
      </p>
      <div
        role="group"
        aria-label="SPs to move to"
        className="max-h-56 overflow-y-auto rounded-md border [color-scheme:light_dark]"
      >
        {targets.status === "loading" && <LoadingState rows={2} />}
        {targets.status === "error" && (
          <p className="p-3 text-sm text-destructive">
            Couldn&apos;t search SPs.{" "}
            <button type="button" className="underline" onClick={targets.retry}>
              Try again
            </button>
          </p>
        )}
        {targets.status === "ready" && rows.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No SP matches.</p>
        )}
        {rows.length > 0 && (
          <ul>
            {rows.map((row) => {
              const block = reassignTargetBlock(row, fromSpId);
              const isSelected = selected?.user_id === row.user_id;
              const label = spLabel(row);
              return (
                <li key={row.user_id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={block ? `${label}, ${block}` : `Pick ${label}`}
                    disabled={disabled || block !== null}
                    onClick={() => onSelect(row)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isSelected ? "bg-primary/10" : "hover:bg-secondary/60"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{label}</span>
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {row.phone}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {block ? (
                        <span className="text-xs text-muted-foreground">{block}</span>
                      ) : (
                        <KycStatusPill status={row.kyc_status} />
                      )}
                      {isSelected && <Check className="size-4 text-primary" aria-hidden="true" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
