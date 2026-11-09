/**
 * The coupon form (SVC-429), shared by create and edit. Inputs are text, so a
 * stray ₹ or comma is fine and every message is ours, not the browser's. Times are
 * datetime-local inputs read as IST and sent with a +05:30 offset.
 *
 * The client checks run first; when the backend still refuses, its message goes
 * under the field it names (a 409 under the code). Inputs keep what was typed when
 * a save fails, so a refusal costs no retyping. Edit sends only what changed.
 */
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changedFields,
  couponErrorField,
  couponErrorMessage,
  createBody,
  createCoupon,
  emptyCouponForm,
  formFromRow,
  normaliseCode,
  patchCoupon,
  validateCouponForm,
  COUPON_FIELDS,
  type CouponErrors,
  type CouponField,
  type CouponForm as FormState,
  type CouponRow,
  type DiscountType,
} from "@/lib/coupons";

type Props =
  | { mode: "create"; onCreated: (row: CouponRow) => void }
  | { mode: "edit"; row: CouponRow; onSaved: (row: CouponRow) => void };

type Status = "idle" | "saving" | "saved" | "unchanged";

type ServerError = { field: CouponField | null; message: string };

// Without a limit Chrome takes a six-digit year. Night mode only swaps our tokens,
// so without color-scheme Chrome draws the picker icon dark on dark (SVC-423).
const DATETIME = { type: "datetime-local", max: "9999-12-31T23:59" } as const;
const DATETIME_CLASS = "[color-scheme:light_dark]";

export function CouponForm(props: Props) {
  const idBase = useId();
  const editing = props.mode === "edit";
  const [baseline, setBaseline] = useState<CouponRow | null>(editing ? props.row : null);
  const [form, setForm] = useState<FormState>(() =>
    props.mode === "edit" ? formFromRow(props.row) : emptyCouponForm(),
  );
  const [errors, setErrors] = useState<CouponErrors>({});
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  // State updates a render late, and a double click is quicker than that.
  const inFlight = useRef(false);

  const fieldId = (field: CouponField) => `${idBase}-${field}`;
  const dirty = baseline !== null && JSON.stringify(form) !== JSON.stringify(formFromRow(baseline));

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as CouponField];
      return next;
    });
    setServerError((current) =>
      current && (current.field === key || current.field === null) ? null : current,
    );
    setStatus("idle");
  }

  function errorFor(field: CouponField): string | undefined {
    return errors[field] ?? (serverError?.field === field ? serverError.message : undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const check = validateCouponForm(form, {
      mode: props.mode,
      now: new Date(),
      row: baseline ?? undefined,
    });
    if (!check.ok) {
      setErrors(check.errors);
      setServerError(null);
      const first = COUPON_FIELDS.find((field) => field in check.errors);
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    setErrors({});

    let request: Promise<CouponRow>;
    if (baseline) {
      const patch = changedFields(baseline, check.values);
      if (Object.keys(patch).length === 0) {
        setStatus("unchanged");
        return;
      }
      request = patchCoupon(baseline.code, patch);
    } else {
      request = createCoupon(createBody(check.values));
    }

    inFlight.current = true;
    setStatus("saving");
    setServerError(null);
    try {
      const saved = await request;
      if (props.mode === "edit") {
        setBaseline(saved);
        setForm(formFromRow(saved));
        setStatus("saved");
        props.onSaved(saved);
      } else {
        props.onCreated(saved);
      }
    } catch (err) {
      const field = couponErrorField(err);
      setServerError({ field, message: couponErrorMessage(err) });
      setStatus("idle");
      if (field) document.getElementById(fieldId(field))?.focus();
    } finally {
      inFlight.current = false;
    }
  }

  const percent = form.discount_type === "percent";
  const busy = status === "saving";
  const field = (name: CouponField) => ({ id: fieldId(name), error: errorFor(name) });

  return (
    <form onSubmit={submit} className="min-w-0 space-y-6" noValidate aria-busy={busy}>
      {!editing && (
        <Field
          {...field("code")}
          label="Code"
          hint="3 to 20 letters or digits, typed in capitals. Customers can enter it in any case."
        >
          {(describedBy) => (
            <Input
              id={fieldId("code")}
              value={form.code}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="e.g. DIWALI25"
              className="font-mono uppercase"
              aria-invalid={errorFor("code") ? true : undefined}
              aria-describedby={describedBy}
              onChange={(event) => set("code", normaliseCode(event.target.value))}
            />
          )}
        </Field>
      )}

      <fieldset className="min-w-0 space-y-4">
        <legend className="mb-3 text-sm font-semibold">Discount</legend>
        <DiscountTypeChoice
          id={fieldId("discount_type")}
          name={`${idBase}-discount-type`}
          value={form.discount_type}
          error={errorFor("discount_type")}
          onChange={(type) => set("discount_type", type)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            {...field("discount_value")}
            label="Discount value"
            hint={percent ? "A percent, more than 0 and at most 100." : "Rupees off the order."}
          >
            {(describedBy) => (
              <Input
                id={fieldId("discount_value")}
                value={form.discount_value}
                inputMode="decimal"
                autoComplete="off"
                placeholder={percent ? "e.g. 10" : "e.g. 100"}
                className="tabular-nums"
                aria-invalid={errorFor("discount_value") ? true : undefined}
                aria-describedby={describedBy}
                onChange={(event) => set("discount_value", event.target.value)}
              />
            )}
          </Field>
          {percent && (
            <Field
              {...field("max_discount")}
              label="Max discount (₹)"
              hint="Optional. Leave it empty for no cap."
            >
              {(describedBy) => (
                <Input
                  id={fieldId("max_discount")}
                  value={form.max_discount}
                  inputMode="decimal"
                  autoComplete="off"
                  className="tabular-nums"
                  aria-invalid={errorFor("max_discount") ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(event) => set("max_discount", event.target.value)}
                />
              )}
            </Field>
          )}
          <Field
            {...field("min_order_amount")}
            label="Min order (₹)"
            hint="Optional. Leave it empty for no minimum."
          >
            {(describedBy) => (
              <Input
                id={fieldId("min_order_amount")}
                value={form.min_order_amount}
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
                aria-invalid={errorFor("min_order_amount") ? true : undefined}
                aria-describedby={describedBy}
                onChange={(event) => set("min_order_amount", event.target.value)}
              />
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-4">
        <legend className="mb-3 text-sm font-semibold">Validity (IST)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            {...field("valid_from")}
            label="Valid from"
            hint={editing ? "IST." : "Starts now if left empty. IST."}
          >
            {(describedBy) => (
              <Input
                id={fieldId("valid_from")}
                {...DATETIME}
                value={form.valid_from}
                className={DATETIME_CLASS}
                aria-invalid={errorFor("valid_from") ? true : undefined}
                aria-describedby={describedBy}
                onChange={(event) => set("valid_from", event.target.value)}
              />
            )}
          </Field>
          <Field {...field("valid_until")} label="Valid until" hint="IST.">
            {(describedBy) => (
              <Input
                id={fieldId("valid_until")}
                {...DATETIME}
                value={form.valid_until}
                className={DATETIME_CLASS}
                aria-invalid={errorFor("valid_until") ? true : undefined}
                aria-describedby={describedBy}
                onChange={(event) => set("valid_until", event.target.value)}
              />
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-4">
        <legend className="mb-3 text-sm font-semibold">Limits</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            {...field("usage_limit")}
            label="Usage limit"
            hint="Total uses across all customers. Leave it empty for unlimited."
          >
            {(describedBy) => (
              <Input
                id={fieldId("usage_limit")}
                value={form.usage_limit}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Unlimited"
                className="tabular-nums"
                aria-invalid={errorFor("usage_limit") ? true : undefined}
                aria-describedby={describedBy}
                onChange={(event) => set("usage_limit", event.target.value)}
              />
            )}
          </Field>
          <Field
            {...field("usage_limit_per_user")}
            label="Uses per customer"
            hint="How many times one customer can use it."
          >
            {(describedBy) => (
              <Input
                id={fieldId("usage_limit_per_user")}
                value={form.usage_limit_per_user}
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
                aria-invalid={errorFor("usage_limit_per_user") ? true : undefined}
                aria-describedby={describedBy}
                onChange={(event) => set("usage_limit_per_user", event.target.value)}
              />
            )}
          </Field>
        </div>
        {!editing && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              className="mt-0.5 size-4 accent-primary [color-scheme:light_dark]"
              onChange={(event) => set("is_active", event.target.checked)}
            />
            <span>
              <span className="font-medium">Active</span>
              <span className="block text-xs text-muted-foreground">
                Off: it's created paused, and nobody can apply it until it's activated.
              </span>
            </span>
          </label>
        )}
      </fieldset>

      {serverError && serverError.field === null && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive [overflow-wrap:anywhere]"
        >
          {serverError.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || (editing && !dirty)}>
          {editing ? (busy ? "Saving…" : "Save changes") : busy ? "Creating…" : "Create coupon"}
        </Button>
        {editing && dirty && !busy && baseline && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setForm(formFromRow(baseline));
              setErrors({});
              setServerError(null);
              setStatus("idle");
            }}
          >
            Discard changes
          </Button>
        )}
        <p role="status" className="text-sm text-muted-foreground">
          {status === "saved" ? "Saved." : status === "unchanged" ? "Nothing changed." : ""}
        </p>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(describedBy || undefined)}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive [overflow-wrap:anywhere]">
          {error}
        </p>
      )}
    </div>
  );
}

const TYPE_OPTIONS: { value: DiscountType; label: string }[] = [
  { value: "percent", label: "Percent" },
  { value: "flat", label: "Flat amount" },
];

function DiscountTypeChoice({
  id,
  name,
  value,
  error,
  onChange,
}: {
  id: string;
  name: string;
  value: DiscountType;
  error?: string;
  onChange: (value: DiscountType) => void;
}) {
  const errorId = `${id}-error`;
  return (
    <div
      role="radiogroup"
      aria-label="Discount type"
      aria-describedby={error ? errorId : undefined}
      className="space-y-1.5"
    >
      <div className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1">
        {TYPE_OPTIONS.map((option, index) => (
          <label
            key={option.value}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring ${
              value === option.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <input
              type="radio"
              id={index === 0 ? id : undefined}
              name={name}
              value={option.value}
              checked={value === option.value}
              className="sr-only"
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
