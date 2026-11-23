/**
 * Add or edit one variant (SVC-481): label, price, commission %, duration, sort
 * order, with the customer's GST shown read-only. Rules: lib/catalog-variants.ts.
 *
 * An edit saves in up to three steps:
 * 1. the form. Only what changed is sent; nothing changed sends nothing.
 * 2. a changed price first asks the backend what it does to the recommended range
 *    (price-impact, a read) and shows the counts. Back saves nothing.
 * 3. the writes (SVC-486). A changed percent is never PATCHed: it is scheduled
 *    with POST .../commission-changes from the "Effective from" date, FIRST. If
 *    that is refused, nothing else is sent. Only then does the PATCH carry the
 *    other changed fields. If the PATCH is refused after the POST worked, the
 *    service is fetched again so the editor shows the pending change, and the
 *    dialog stays open on the PATCH's error.
 * While a change is pending the percent can't be edited: cancel it first.
 * A create sends commission_pct as before: no pro has priced a new variant.
 */
import { useId, useRef, useState, type FormEvent } from "react";
import { Field, FormError } from "@/components/catalog/Field";
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
import {
  catalogErrorField,
  catalogErrorMessage,
  createVariant,
  getServiceDetail,
  patchVariant,
  scheduleCommissionChange,
  variantPriceImpact,
  type CommissionChange,
  type CommissionChangeCreate,
  type FormErrors,
  type ServiceDetail,
  type ServiceVariantRow,
  type VariantPatch,
  type VariantPriceImpact,
} from "@/lib/catalog";
import {
  VARIANT_FIELDS,
  changedVariantFields,
  checkEffectiveFrom,
  effectiveFromMin,
  emptyVariantForm,
  impactLines,
  parsePct,
  pctChange,
  pctLabel,
  pendingLabel,
  previewSplit,
  validateVariantForm,
  variantCreateBody,
  variantFormFrom,
  withoutPct,
  type PctChange,
  type VariantField,
  type VariantForm,
} from "@/lib/catalog-variants";
import { formatEffectiveDate, todayIst } from "@/lib/ist-date";
import { formatRupees } from "@/lib/money";

/** An edit's writes: the schedule (when the percent changed), then the PATCH of the rest. */
type Writes = { schedule: CommissionChangeCreate | null; patch: VariantPatch };

type Step = { kind: "form" } | { kind: "impact"; writes: Writes; impact: VariantPriceImpact };

type DialogField = VariantField | "effective_from";
const DIALOG_FIELDS: DialogField[] = [...VARIANT_FIELDS, "effective_from"];

type ServerError = { field: DialogField | null; message: string };

/** The date as entered, per direction: switching direction starts at that one's default. */
type DateValue = { change: PctChange; value: string };

/** What the schedule did, for the editor's notice. */
function scheduledText(label: string, change: CommissionChange): string {
  const pct = pctLabel(change.new_pct);
  return change.status === "applied"
    ? `${label}'s commission is now ${pct}.`
    : `${label}'s commission changes to ${pct} from ${formatEffectiveDate(change.effective_from)}.`;
}

/** The field a refusal names. A 422 on new_pct belongs on the percent field. */
function errorField(err: unknown): DialogField | null {
  const field = catalogErrorField(err, [...DIALOG_FIELDS, "new_pct"]);
  return field === "new_pct" ? "commission_pct" : field;
}

export function VariantDialog({
  serviceId,
  variant,
  gstPercent,
  onClose,
  onSaved,
  onRefreshed,
}: {
  serviceId: string;
  /** Null: add a new one. */
  variant: ServiceVariantRow | null;
  /** The GST a new variant gets (the service's first variant's), or the row's own. */
  gstPercent: number | null;
  onClose: () => void;
  /** Null detail: the writes worked but the service couldn't be fetched again. */
  onSaved: (detail: ServiceDetail | null, message: string) => void;
  /** The schedule worked and the PATCH didn't: the fresh service, with the dialog still open. */
  onRefreshed: (detail: ServiceDetail) => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState<VariantForm>(() =>
    variant ? variantFormFrom(variant) : emptyVariantForm(),
  );
  const [date, setDate] = useState<DateValue | null>(null);
  const [errors, setErrors] = useState<FormErrors<DialogField>>({});
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [busy, setBusy] = useState(false);
  const [unchanged, setUnchanged] = useState(false);
  const inFlight = useRef(false);

  const fieldId = (field: DialogField) => `${idBase}-${field}`;
  const errorFor = (field: DialogField) =>
    errors[field] ?? (serverError?.field === field ? serverError.message : undefined);
  const preview = previewSplit(form, variant ?? undefined);

  // SVC-486: an existing variant's new percent is scheduled, counted from today in IST.
  const pending = variant?.pending_commission_change ?? null;
  const today = todayIst();
  const typedPct = parsePct(form.commission_pct);
  const change: PctChange | null =
    variant && !pending && typedPct.ok ? pctChange(variant, typedPct.value) : null;
  const minDate = change ? effectiveFromMin(change, today) : "";
  const effectiveFrom = change ? (date?.change === change ? date.value : minDate) : "";

  function clearError(key: DialogField) {
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setServerError((current) =>
      current && (current.field === key || current.field === null) ? null : current,
    );
  }

  function set(key: VariantField, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    clearError(key);
    if (key === "commission_pct") clearError("effective_from");
    setUnchanged(false);
  }

  function setEffectiveFrom(value: string) {
    if (!change) return;
    setDate({ change, value });
    clearError("effective_from");
    setUnchanged(false);
  }

  async function guarded(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function refused(err: unknown, prefix?: string) {
    const field = errorField(err);
    const message = catalogErrorMessage(err);
    setServerError({ field, message: prefix && !field ? `${prefix} ${message}` : message });
    setStep({ kind: "form" });
    if (field) setTimeout(() => document.getElementById(fieldId(field))?.focus());
  }

  /** The service again, or null if that fails too. */
  async function fresh(): Promise<ServiceDetail | null> {
    try {
      return await getServiceDetail(serviceId);
    } catch {
      return null;
    }
  }

  /** The writes, in order: the schedule first, then the PATCH of everything else. */
  async function send(row: ServiceVariantRow, { schedule, patch }: Writes) {
    const label = patch.label ?? row.label;
    let scheduled: CommissionChange | null = null;
    if (schedule) {
      try {
        scheduled = await scheduleCommissionChange(serviceId, row.id, schedule);
      } catch (err) {
        refused(err);
        return;
      }
    }

    if (Object.keys(patch).length === 0) {
      // Only the percent changed; the POST answers with the change, not the service.
      const detail = await fresh();
      const text = scheduled ? scheduledText(label, scheduled) : `${label} is saved.`;
      onSaved(detail, detail ? text : `${text} Reload the page to see it.`);
      return;
    }

    try {
      const detail = await patchVariant(serviceId, row.id, patch);
      const texts = [`${label} is saved.`];
      if (scheduled) texts.push(scheduledText(label, scheduled));
      onSaved(detail, texts.join(" "));
    } catch (err) {
      if (!scheduled) {
        refused(err);
        return;
      }
      // The change is on the server: show it, and keep the form on the fresh row.
      const detail = await fresh();
      const next = detail?.variants.find((v) => v.id === row.id);
      if (detail && next) {
        onRefreshed(detail);
        setForm((current) => ({
          ...current,
          commission_pct: variantFormFrom(next).commission_pct,
        }));
        setDate(null);
      }
      refused(err, `${scheduledText(label, scheduled)} The other changes weren't saved:`);
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    return guarded(async () => {
      const check = validateVariantForm(form, variant ?? undefined);
      const dateError = change ? checkEffectiveFrom(effectiveFrom, change, todayIst()) : null;
      if (!check.ok || dateError) {
        const found: FormErrors<DialogField> = check.ok ? {} : { ...check.errors };
        if (dateError) found.effective_from = dateError;
        setErrors(found);
        setServerError(null);
        const first = DIALOG_FIELDS.find((field) => field in found);
        if (first) document.getElementById(fieldId(first))?.focus();
        return;
      }
      setErrors({});
      setServerError(null);

      if (!variant) {
        try {
          const detail = await createVariant(serviceId, variantCreateBody(check.values));
          onSaved(detail, `${check.values.label} is added and active.`);
        } catch (err) {
          refused(err);
        }
        return;
      }

      const writes: Writes = {
        schedule: change
          ? { new_pct: check.values.commission_pct, effective_from: effectiveFrom }
          : null,
        patch: withoutPct(changedVariantFields(variant, check.values)),
      };
      if (!writes.schedule && Object.keys(writes.patch).length === 0) {
        setUnchanged(true);
        return;
      }
      if (writes.patch.base_price !== undefined) {
        try {
          const impact = await variantPriceImpact(serviceId, variant.id, writes.patch.base_price);
          setStep({ kind: "impact", writes, impact });
        } catch (err) {
          refused(err);
        }
        return;
      }
      await send(variant, writes);
    });
  };

  function close() {
    if (!inFlight.current) onClose();
  }

  const title = variant ? `Edit ${variant.label}` : "Add variant";

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto [color-scheme:light_dark]">
        {step.kind === "form" && (
          <form onSubmit={submit} noValidate aria-busy={busy} className="min-w-0 space-y-4">
            <DialogHeader>
              <DialogTitle className="[overflow-wrap:anywhere]">{title}</DialogTitle>
              <DialogDescription>
                {variant
                  ? "Pros' own prices and existing bookings don't change."
                  : "It's active once added. Customers see it as soon as a pro sets a price."}
              </DialogDescription>
            </DialogHeader>

            <Field
              id={fieldId("label")}
              error={errorFor("label")}
              label="Label"
              hint="Unique within this service."
            >
              {(describedBy) => (
                <Input
                  id={fieldId("label")}
                  value={form.label}
                  autoComplete="off"
                  placeholder="e.g. 2 BHK"
                  aria-invalid={errorFor("label") ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(event) => set("label", event.target.value)}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id={fieldId("base_price")}
                error={errorFor("base_price")}
                label="Price (₹)"
                hint="What the customer pays. More than 0."
              >
                {(describedBy) => (
                  <Input
                    id={fieldId("base_price")}
                    value={form.base_price}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="e.g. 2499"
                    className="tabular-nums"
                    aria-invalid={errorFor("base_price") ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => set("base_price", event.target.value)}
                  />
                )}
              </Field>
              <Field
                id={fieldId("commission_pct")}
                error={errorFor("commission_pct")}
                label="Commission (%)"
                hint={
                  pending
                    ? `${pendingLabel(pending)} is scheduled. Cancel it first to change the commission.`
                    : "The platform's share. 0 to below 100."
                }
              >
                {(describedBy) => (
                  <Input
                    id={fieldId("commission_pct")}
                    value={form.commission_pct}
                    disabled={pending !== null}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="e.g. 30"
                    className="tabular-nums"
                    aria-invalid={errorFor("commission_pct") ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => set("commission_pct", event.target.value)}
                  />
                )}
              </Field>
            </div>

            {change && (
              <Field
                id={fieldId("effective_from")}
                error={errorFor("effective_from")}
                label="Effective from"
                hint={
                  change === "increase"
                    ? `An increase needs 14 days' notice to pros: ${formatEffectiveDate(minDate)} or later. It starts at 00:00 IST.`
                    : "A decrease dated today applies at once; a later date starts at 00:00 IST."
                }
              >
                {(describedBy) => (
                  <Input
                    id={fieldId("effective_from")}
                    type="date"
                    required
                    min={minDate}
                    value={effectiveFrom}
                    className="tabular-nums sm:w-56"
                    aria-invalid={errorFor("effective_from") ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => setEffectiveFrom(event.target.value)}
                  />
                )}
              </Field>
            )}

            <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {preview
                ? `${formatRupees(preview.commission)} commission · ${formatRupees(preview.payout)} payout${change ? ` from ${formatEffectiveDate(effectiveFrom || minDate)}` : ""}`
                : "Enter a price and a commission % to see the split."}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id={fieldId("duration_minutes")}
                error={errorFor("duration_minutes")}
                label="Duration (minutes)"
                hint={
                  variant?.duration_minutes != null
                    ? "15 to 480."
                    : "15 to 480. Blank: the service's duration."
                }
              >
                {(describedBy) => (
                  <Input
                    id={fieldId("duration_minutes")}
                    value={form.duration_minutes}
                    inputMode="numeric"
                    autoComplete="off"
                    className="tabular-nums"
                    aria-invalid={errorFor("duration_minutes") ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => set("duration_minutes", event.target.value)}
                  />
                )}
              </Field>
              <Field
                id={fieldId("sort_order")}
                error={errorFor("sort_order")}
                label="Sort order"
                hint={variant ? "0 to 9999. Lower comes first." : "Blank: last."}
              >
                {(describedBy) => (
                  <Input
                    id={fieldId("sort_order")}
                    value={form.sort_order}
                    inputMode="numeric"
                    autoComplete="off"
                    className="tabular-nums"
                    aria-invalid={errorFor("sort_order") ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => set("sort_order", event.target.value)}
                  />
                )}
              </Field>
            </div>

            <div className="space-y-0.5">
              <p className="text-sm font-medium">Customer GST</p>
              <p className="text-sm text-muted-foreground">
                {gstPercent === null ? "—" : pctLabel(gstPercent)} · read-only
                {variant ? "" : ", copied from the service's first variant"}
              </p>
            </div>

            {serverError && serverError.field === null && (
              <FormError message={serverError.message} />
            )}

            <DialogFooter className="gap-2">
              <p role="status" className="self-center text-sm text-muted-foreground sm:mr-auto">
                {unchanged ? "Nothing changed." : ""}
              </p>
              <Button type="button" variant="ghost" disabled={busy} onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : variant ? "Save" : "Add variant"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step.kind === "impact" && variant && (
          <div className="min-w-0 space-y-4">
            <DialogHeader>
              <DialogTitle>Change the price?</DialogTitle>
              <DialogDescription className="tabular-nums">
                {variant.label}: {formatRupees(variant.base_price)} →{" "}
                {formatRupees(step.writes.patch.base_price ?? variant.base_price)}
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-1 text-sm">
              {impactLines(step.impact).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setStep({ kind: "form" })}
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => guarded(() => send(variant, step.writes))}
              >
                {busy ? "Saving…" : "Save price"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
