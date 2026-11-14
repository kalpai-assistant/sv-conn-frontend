/**
 * Resolve an open dispute (SVC-431): full, partial or no refund, with notes.
 * Every resolve goes through a confirm naming the amount and the channel; the
 * call is made only from there, once.
 *
 * Full sends the refundable amount this page loaded: if it changed meanwhile the
 * server refuses (422) instead of refunding a different amount than confirmed.
 * Partial starts empty, so choosing it and clicking through can't refund everything.
 */
import { useRef, useState, type FormEvent } from "react";
import { Field, FormError, Segmented } from "@/components/catalog/Field";
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
import { Textarea } from "@/components/ui/textarea";
import type { AdminRole } from "@/lib/auth";
import {
  RESOLUTION_OPTIONS,
  TEXT_MAX,
  canRefund,
  checkResolveForm,
  confirmCopy,
  emptyResolveForm,
  isCapped,
  resolveDispute,
  type DisputeRefunds,
  type DisputeResolveBody,
  type DisputeRow,
  type ResolveErrors,
  type ResolveForm as Form,
  type ResolutionType,
} from "@/lib/disputes";
import { formatRupees } from "@/lib/money";

export function ResolveForm({
  dispute,
  refunds,
  role,
  customer,
  onResolved,
  onFailed,
}: {
  dispute: DisputeRow;
  refunds: DisputeRefunds;
  role: AdminRole;
  customer: string;
  onResolved: (row: DisputeRow) => void;
  onFailed: (err: unknown) => void;
}) {
  const refundable = canRefund(refunds);
  const [form, setForm] = useState<Form>(() =>
    refundable ? emptyResolveForm() : { ...emptyResolveForm(), resolution_type: "NO_REFUND" },
  );
  const [errors, setErrors] = useState<ResolveErrors>({});
  const [pending, setPending] = useState<DisputeResolveBody | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const options = refundable
    ? RESOLUTION_OPTIONS
    : RESOLUTION_OPTIONS.filter((option) => option.value === "NO_REFUND");
  const manual = refunds.channel === "MANUAL";
  const type = form.resolution_type;

  function review(event: FormEvent) {
    event.preventDefault();
    const check = checkResolveForm(form, { refunds, role });
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setPending(check.body);
  }

  async function confirm() {
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const row = await resolveDispute(dispute.id, pending);
      setPending(null);
      onResolved(row);
    } catch (err) {
      // The page shows the message and reloads; the form keeps what was typed.
      setPending(null);
      onFailed(err);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const copy = pending ? confirmCopy(pending, refunds.channel, customer) : null;

  return (
    <form onSubmit={review} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium" aria-hidden="true">
          Resolution
        </p>
        <Segmented<ResolutionType>
          name="resolution_type"
          label="Resolution"
          value={type}
          options={options}
          oneRow
          onChange={(next) => {
            setForm({ ...form, resolution_type: next });
            setErrors({});
          }}
        />
        {!refundable && (
          <p className="text-xs text-muted-foreground">
            Nothing is left to refund on this booking, so it can only close with no refund.
          </p>
        )}
        {errors.resolution_type && <FormError message={errors.resolution_type} />}
      </div>

      {type !== "NO_REFUND" && (
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          {manual && (
            <p className="text-sm font-medium">
              Manual refund: record only, pay the customer outside the app
            </p>
          )}
          {type === "FULL_REFUND" ? (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Amount</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatRupees(refunds.refundable)}
              </p>
              <p className="text-xs text-muted-foreground">Everything left to refund.</p>
              {errors.amount && <FormError message={errors.amount} />}
            </div>
          ) : (
            <Field
              id="refund-amount"
              label="Amount (₹)"
              hint={`Up to ${formatRupees(refunds.refundable)}${
                isCapped(role)
                  ? `; support's cap is ${formatRupees(refunds.support_refund_limit)}`
                  : ""
              }.`}
              error={errors.amount}
            >
              {(describedBy) => (
                <Input
                  id="refund-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.amount}
                  aria-describedby={describedBy}
                  aria-invalid={errors.amount ? true : undefined}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                />
              )}
            </Field>
          )}
        </div>
      )}

      <Field
        id="resolution-notes"
        label="Notes"
        hint={
          manual && type !== "NO_REFUND"
            ? `The decision, and how the customer was paid (UPI reference, say). ${form.notes.trim().length} / ${TEXT_MAX}`
            : `The decision and why. ${form.notes.trim().length} / ${TEXT_MAX}`
        }
        error={errors.notes}
      >
        {(describedBy) => (
          <Textarea
            id="resolution-notes"
            rows={3}
            value={form.notes}
            aria-describedby={describedBy}
            aria-invalid={errors.notes ? true : undefined}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        )}
      </Field>

      <Button type="submit">Resolve…</Button>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && setPending(null)}>
        <DialogContent className="grid-cols-[minmax(0,1fr)]">
          {copy && (
            <>
              <DialogHeader>
                <DialogTitle>{copy.title}</DialogTitle>
                <DialogDescription>{copy.detail}</DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setPending(null)}
                >
                  Go back
                </Button>
                <Button
                  type="button"
                  variant={pending?.refund_amount === undefined ? "default" : "destructive"}
                  disabled={busy}
                  onClick={confirm}
                >
                  {busy ? "Working…" : copy.action}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </form>
  );
}
