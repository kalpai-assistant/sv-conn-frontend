/**
 * The service form (SVC-430), shared by create and edit: name, category,
 * description (markdown), price, duration, price unit with its minimum quantity,
 * and icon, plus Active on create. Pricing formulas live on the pricing screen
 * (SVC-428) and variants elsewhere; this form doesn't touch either.
 *
 * The minimum quantity shows only for PER_SQFT / PER_HOUR, labelled with the unit.
 * Switching to another unit sends min_qty: null with it, as the backend needs.
 * Edit sends only what changed, so a seeded row that breaks today's create rules
 * (a base price of 0) saves fine as long as the price isn't touched.
 */
import { useId, useRef, useState, type FormEvent } from "react";
import { Field, FormError, Segmented } from "@/components/catalog/Field";
import { IconPicker } from "@/components/catalog/IconPicker";
import { MarkdownField } from "@/components/catalog/MarkdownField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRICE_UNIT_OPTIONS,
  SERVICE_FIELDS,
  catalogErrorField,
  catalogErrorMessage,
  changedServiceFields,
  createService,
  emptyServiceForm,
  minQtyLabel,
  needsMinQty,
  patchService,
  serviceCategoryGroups,
  serviceCreateBody,
  serviceFormFrom,
  validateServiceForm,
  type CatalogCategoryNode,
  type FormErrors,
  type PriceUnit,
  type ServiceDetail,
  type ServiceField,
  type ServiceForm as FormState,
} from "@/lib/catalog";

type Props = { categories: CatalogCategoryNode[] } & (
  | { mode: "create"; categoryId?: string; onCreated: (row: ServiceDetail) => void }
  | { mode: "edit"; detail: ServiceDetail; onSaved: (row: ServiceDetail) => void }
);

type Status = "idle" | "saving" | "saved" | "unchanged";
type ServerError = { field: ServiceField | null; message: string };

export function ServiceForm(props: Props) {
  const idBase = useId();
  const editing = props.mode === "edit";
  const [baseline, setBaseline] = useState<ServiceDetail | null>(editing ? props.detail : null);
  const [form, setForm] = useState<FormState>(() =>
    props.mode === "edit" ? serviceFormFrom(props.detail) : emptyServiceForm(props.categoryId),
  );
  const [errors, setErrors] = useState<FormErrors<ServiceField>>({});
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const inFlight = useRef(false);

  const fieldId = (field: ServiceField) => `${idBase}-${field}`;
  const dirty =
    baseline !== null && JSON.stringify(form) !== JSON.stringify(serviceFormFrom(baseline));
  const groups = serviceCategoryGroups(props.categories);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      // A unit change also settles the minimum quantity's error.
      const cleared = key === "price_unit" ? [key, "min_qty"] : [key];
      if (!cleared.some((name) => name in current)) return current;
      const next = { ...current };
      for (const name of cleared) delete next[name as ServiceField];
      return next;
    });
    setServerError((current) =>
      current && (current.field === key || current.field === null) ? null : current,
    );
    setStatus("idle");
  }

  function errorFor(field: ServiceField): string | undefined {
    return errors[field] ?? (serverError?.field === field ? serverError.message : undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const check = validateServiceForm(form, {
      baseline: baseline ?? undefined,
      categories: props.categories,
    });
    if (!check.ok) {
      setErrors(check.errors);
      setServerError(null);
      const first = SERVICE_FIELDS.find((field) => field in check.errors);
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    setErrors({});

    let request: Promise<ServiceDetail>;
    if (baseline) {
      const patch = changedServiceFields(baseline, check.values);
      if (Object.keys(patch).length === 0) {
        setStatus("unchanged");
        return;
      }
      request = patchService(baseline.id, patch);
    } else {
      request = createService(serviceCreateBody(check.values));
    }

    inFlight.current = true;
    setStatus("saving");
    setServerError(null);
    try {
      const saved = await request;
      if (props.mode === "edit") {
        setBaseline(saved);
        setForm(serviceFormFrom(saved));
        setStatus("saved");
        props.onSaved(saved);
      } else {
        props.onCreated(saved);
      }
    } catch (err) {
      const field = catalogErrorField(err, SERVICE_FIELDS);
      setServerError({ field, message: catalogErrorMessage(err) });
      setStatus("idle");
      if (field) document.getElementById(fieldId(field))?.focus();
    } finally {
      inFlight.current = false;
    }
  }

  const busy = status === "saving";
  const field = (name: ServiceField) => ({ id: fieldId(name), error: errorFor(name) });
  const showMinQty = needsMinQty(form.price_unit);

  return (
    <form onSubmit={submit} className="min-w-0 space-y-6" noValidate aria-busy={busy}>
      <Field
        {...field("name")}
        label="Name"
        hint="3 to 200 characters. Unique within its category."
      >
        {(describedBy) => (
          <Input
            id={fieldId("name")}
            value={form.name}
            autoComplete="off"
            placeholder="e.g. Basin installation"
            aria-invalid={errorFor("name") ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => set("name", event.target.value)}
          />
        )}
      </Field>

      <Field
        {...field("category_id")}
        label="Category"
        hint="A category with sub-categories can't hold services, so only its sub-categories are listed."
      >
        {(describedBy) => (
          <Select value={form.category_id} onValueChange={(next) => set("category_id", next)}>
            <SelectTrigger
              id={fieldId("category_id")}
              aria-invalid={errorFor("category_id") ? true : undefined}
              aria-describedby={describedBy}
            >
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        {...field("description")}
        label="Description"
        hint="Markdown: blank line for a new paragraph, - or 1. for lists, **bold**, *italic*. Nothing else is formatted."
      >
        {(describedBy) => (
          <MarkdownField
            id={fieldId("description")}
            value={form.description}
            invalid={Boolean(errorFor("description"))}
            describedBy={describedBy}
            onChange={(value) => set("description", value)}
          />
        )}
      </Field>

      <fieldset className="min-w-0 space-y-4">
        <legend className="mb-3 text-sm font-semibold">Price</legend>
        <Segmented<PriceUnit>
          id={fieldId("price_unit")}
          name={`${idBase}-unit`}
          label="Price unit"
          value={form.price_unit}
          options={PRICE_UNIT_OPTIONS}
          onChange={(unit) => set("price_unit", unit)}
        />
        {errorFor("price_unit") && (
          <p role="alert" className="text-xs text-destructive">
            {errorFor("price_unit")}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            {...field("base_price")}
            label="Base price (₹)"
            hint="More than 0, at most ₹10,00,000."
          >
            {(describedBy) => (
              <Input
                id={fieldId("base_price")}
                value={form.base_price}
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 499"
                className="tabular-nums"
                aria-invalid={errorFor("base_price") ? true : undefined}
                aria-describedby={describedBy}
                onChange={(event) => set("base_price", event.target.value)}
              />
            )}
          </Field>
          {showMinQty && (
            <Field
              {...field("min_qty")}
              label={minQtyLabel(form.price_unit)}
              hint="The least a customer can book."
            >
              {(describedBy) => (
                <Input
                  id={fieldId("min_qty")}
                  value={form.min_qty}
                  inputMode="numeric"
                  autoComplete="off"
                  className="tabular-nums"
                  aria-invalid={errorFor("min_qty") ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(event) => set("min_qty", event.target.value)}
                />
              )}
            </Field>
          )}
          <Field {...field("duration_minutes")} label="Duration (minutes)" hint="15 to 480.">
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
        </div>
      </fieldset>

      <Field
        {...field("icon_key")}
        label="Icon"
        hint="Shown on the service's card. Without one, the card shows its category's icon."
      >
        {(describedBy) => (
          <IconPicker
            id={fieldId("icon_key")}
            name={`${idBase}-icon`}
            value={form.icon_key}
            describedBy={describedBy}
            onChange={(key) => set("icon_key", key)}
          />
        )}
      </Field>

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
              Off: it's created hidden, and customers can't book it until it's activated.
            </span>
          </span>
        </label>
      )}

      {serverError && serverError.field === null && <FormError message={serverError.message} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || (editing && !dirty)}>
          {editing ? (busy ? "Saving…" : "Save changes") : busy ? "Creating…" : "Create service"}
        </Button>
        {editing && dirty && !busy && baseline && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setForm(serviceFormFrom(baseline));
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
