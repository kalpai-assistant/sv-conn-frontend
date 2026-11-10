/**
 * A labelled form field with its hint and error, for the catalog forms (SVC-430).
 * The same shape as CouponForm's own Field, kept separate so the coupon screen
 * stays untouched.
 */
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <div className="min-w-0 space-y-1.5">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
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

/** The form-level refusal: one the backend sent without naming a field. */
export function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive [overflow-wrap:anywhere]"
    >
      {message}
    </p>
  );
}

/** A segmented control on native radios, as the coupon form's Percent / Flat. */
export function Segmented<T extends string>({
  id,
  name,
  label,
  value,
  options,
  onChange,
}: {
  id?: string;
  name: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1"
    >
      {options.map((option, index) => (
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
  );
}
