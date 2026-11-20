/**
 * Add or edit one variant (SVC-481): label, price, commission %, duration, sort
 * order, with the customer's GST shown read-only. Rules: lib/catalog-variants.ts.
 *
 * An edit saves in up to three steps:
 * 1. the form. Only what changed is sent; nothing changed sends nothing.
 * 2. a changed price first asks the backend what it does to the recommended range
 *    (price-impact) and shows the counts. Back saves nothing.
 * 3. a commission increase is refused (409 COMMISSION_INCREASE_NEEDS_NOTICE)
 *    until the admin confirms the 14 days' notice to pros. "Confirm increase"
 *    re-sends the same change with confirm: true. confirm is never on a first send.
 * A create has no impact (no pro has priced a new variant) and never needs notice.
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
  patchVariant,
  variantPriceImpact,
  type FormErrors,
  type ServiceDetail,
  type ServiceVariantRow,
  type VariantPatch,
  type VariantPriceImpact,
} from "@/lib/catalog";
import {
  VARIANT_FIELDS,
  changedVariantFields,
  emptyVariantForm,
  impactLines,
  noticeRequired,
  pctLabel,
  previewSplit,
  validateVariantForm,
  variantCreateBody,
  variantFormFrom,
  type NoticeRequired,
  type VariantField,
  type VariantForm,
} from "@/lib/catalog-variants";
import { formatRupees } from "@/lib/money";

type Step =
  | { kind: "form" }
  | { kind: "impact"; patch: VariantPatch; impact: VariantPriceImpact }
  | { kind: "notice"; patch: VariantPatch; notice: NoticeRequired };

type ServerError = { field: VariantField | null; message: string };

export function VariantDialog({
  serviceId,
  variant,
  gstPercent,
  onClose,
  onSaved,
}: {
  serviceId: string;
  /** Null: add a new one. */
  variant: ServiceVariantRow | null;
  /** The GST a new variant gets (the service's first variant's), or the row's own. */
  gstPercent: number | null;
  onClose: () => void;
  onSaved: (detail: ServiceDetail, message: string) => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState<VariantForm>(() =>
    variant ? variantFormFrom(variant) : emptyVariantForm(),
  );
  const [errors, setErrors] = useState<FormErrors<VariantField>>({});
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [busy, setBusy] = useState(false);
  const [unchanged, setUnchanged] = useState(false);
  const inFlight = useRef(false);

  const fieldId = (field: VariantField) => `${idBase}-${field}`;
  const errorFor = (field: VariantField) =>
    errors[field] ?? (serverError?.field === field ? serverError.message : undefined);
  const preview = previewSplit(form, variant ?? undefined);

  function set(key: VariantField, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setServerError((current) =>
      current && (current.field === key || current.field === null) ? null : current,
    );
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

  function refused(err: unknown) {
    const field = catalogErrorField(err, VARIANT_FIELDS);
    setServerError({ field, message: catalogErrorMessage(err) });
    setStep({ kind: "form" });
    if (field) setTimeout(() => document.getElementById(fieldId(field))?.focus());
  }

  /** The PATCH. A first send never carries confirm; only the notice step's button does. */
  async function send(row: ServiceVariantRow, patch: VariantPatch, confirm: boolean) {
    try {
      const detail = await patchVariant(serviceId, row.id, patch, confirm);
      onSaved(detail, `${patch.label ?? row.label} is saved.`);
    } catch (err) {
      const notice = confirm ? null : noticeRequired(err);
      if (notice) setStep({ kind: "notice", patch, notice });
      else refused(err);
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    return guarded(async () => {
      const check = validateVariantForm(form, variant ?? undefined);
      if (!check.ok) {
        setErrors(check.errors);
        setServerError(null);
        const first = VARIANT_FIELDS.find((field) => field in check.errors);
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

      const patch = changedVariantFields(variant, check.values);
      if (Object.keys(patch).length === 0) {
        setUnchanged(true);
        return;
      }
      if (patch.base_price !== undefined) {
        try {
          const impact = await variantPriceImpact(serviceId, variant.id, patch.base_price);
          setStep({ kind: "impact", patch, impact });
        } catch (err) {
          refused(err);
        }
        return;
      }
      await send(variant, patch, false);
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
                hint="The platform's share. 0 to below 100."
              >
                {(describedBy) => (
                  <Input
                    id={fieldId("commission_pct")}
                    value={form.commission_pct}
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
            <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {preview
                ? `${formatRupees(preview.commission)} commission · ${formatRupees(preview.payout)} payout`
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
                {formatRupees(step.patch.base_price ?? variant.base_price)}
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
                onClick={() => guarded(() => send(variant, step.patch, false))}
              >
                {busy ? "Saving…" : "Save price"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step.kind === "notice" && variant && (
          <div className="min-w-0 space-y-4">
            <DialogHeader>
              <DialogTitle>Raise the commission?</DialogTitle>
              <DialogDescription className="tabular-nums">
                {variant.label}: {pctLabel(step.notice.oldPct ?? variant.commission_pct)} →{" "}
                {pctLabel(
                  step.notice.newPct ?? step.patch.commission_pct ?? variant.commission_pct,
                )}
              </DialogDescription>
            </DialogHeader>
            <p
              role="alert"
              className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-foreground [overflow-wrap:anywhere]"
            >
              {step.notice.message}.
            </p>
            <p className="text-sm text-muted-foreground">
              Confirm only once pros have had {step.notice.noticeDays} days' notice of the increase.
            </p>
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
                onClick={() => guarded(() => send(variant, step.patch, true))}
              >
                {busy ? "Saving…" : "Confirm increase"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
