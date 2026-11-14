/**
 * The category form (SVC-430), shared by create and edit: name, parent, icon and
 * sort order, plus Active on create. Deactivate and activate are buttons on the
 * category's page, never a field here, so the backend's checks can't be skipped.
 *
 * The client checks run first; when the backend still refuses, its message goes
 * under the field it names (a 409 under the name). Edit sends only what changed.
 */
import { useId, useRef, useState, type FormEvent } from "react";
import { Field, FormError } from "@/components/catalog/Field";
import { IconPicker } from "@/components/catalog/IconPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_FIELDS,
  catalogErrorField,
  catalogErrorMessage,
  categoryCreateBody,
  categoryFormFrom,
  changedCategoryFields,
  createCategory,
  emptyCategoryForm,
  parentOptions,
  patchCategory,
  validateCategoryForm,
  type CatalogCategoryNode,
  type CategoryDetail,
  type CategoryField,
  type CategoryForm as FormState,
  type FormErrors,
} from "@/lib/catalog";

type Props = { categories: CatalogCategoryNode[] } & (
  | { mode: "create"; parentId?: string; onCreated: (row: CategoryDetail) => void }
  | { mode: "edit"; detail: CategoryDetail; onSaved: (row: CategoryDetail) => void }
);

type Status = "idle" | "saving" | "saved" | "unchanged";
type ServerError = { field: CategoryField | null; message: string };

// A Select item can't have an empty value, and no category id looks like this.
const TOP_LEVEL = "__top__";

export const ICON_HINT =
  "Customers see this icon only on categories added here. The original categories keep their designed icon, and a tile with an illustration shows that instead.";

export function CategoryForm(props: Props) {
  const idBase = useId();
  const editing = props.mode === "edit";
  const [baseline, setBaseline] = useState<CategoryDetail | null>(editing ? props.detail : null);
  const [form, setForm] = useState<FormState>(() =>
    props.mode === "edit" ? categoryFormFrom(props.detail) : emptyCategoryForm(props.parentId),
  );
  const [errors, setErrors] = useState<FormErrors<CategoryField>>({});
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const inFlight = useRef(false);

  const fieldId = (field: CategoryField) => `${idBase}-${field}`;
  const dirty =
    baseline !== null && JSON.stringify(form) !== JSON.stringify(categoryFormFrom(baseline));
  // The backend refuses a parent for a category with sub-categories: two levels only.
  const hasChildren = (baseline?.subcategory_count ?? 0) > 0;
  const parents = parentOptions(props.categories, baseline?.id ?? null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as CategoryField];
      return next;
    });
    setServerError((current) =>
      current && (current.field === key || current.field === null) ? null : current,
    );
    setStatus("idle");
  }

  function errorFor(field: CategoryField): string | undefined {
    return errors[field] ?? (serverError?.field === field ? serverError.message : undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const check = validateCategoryForm(form, {
      baseline: baseline ?? undefined,
      categories: props.categories,
    });
    if (!check.ok) {
      setErrors(check.errors);
      setServerError(null);
      const first = CATEGORY_FIELDS.find((field) => field in check.errors);
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    setErrors({});

    let request: Promise<CategoryDetail>;
    if (baseline) {
      const patch = changedCategoryFields(baseline, check.values);
      if (Object.keys(patch).length === 0) {
        setStatus("unchanged");
        return;
      }
      request = patchCategory(baseline.id, patch);
    } else {
      request = createCategory(categoryCreateBody(check.values));
    }

    inFlight.current = true;
    setStatus("saving");
    setServerError(null);
    try {
      const saved = await request;
      if (props.mode === "edit") {
        setBaseline(saved);
        setForm(categoryFormFrom(saved));
        setStatus("saved");
        props.onSaved(saved);
      } else {
        props.onCreated(saved);
      }
    } catch (err) {
      const field = catalogErrorField(err, CATEGORY_FIELDS);
      setServerError({ field, message: catalogErrorMessage(err) });
      setStatus("idle");
      if (field) document.getElementById(fieldId(field))?.focus();
    } finally {
      inFlight.current = false;
    }
  }

  const busy = status === "saving";
  const field = (name: CategoryField) => ({ id: fieldId(name), error: errorFor(name) });

  return (
    <form onSubmit={submit} className="min-w-0 space-y-6" noValidate aria-busy={busy}>
      <Field {...field("name")} label="Name" hint="2 to 100 characters. Unique across the catalog.">
        {(describedBy) => (
          <Input
            id={fieldId("name")}
            value={form.name}
            autoComplete="off"
            placeholder="e.g. Water tank cleaning"
            aria-invalid={errorFor("name") ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => set("name", event.target.value)}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          {...field("parent_id")}
          label="Parent"
          hint={
            hasChildren
              ? "It has sub-categories, so it stays top-level: the catalog has two levels."
              : "Top-level shows as a tile on the consumer home. A sub-category shows inside its parent."
          }
        >
          {(describedBy) => (
            <Select
              value={form.parent_id || TOP_LEVEL}
              disabled={hasChildren}
              onValueChange={(next) => set("parent_id", next === TOP_LEVEL ? "" : next)}
            >
              <SelectTrigger
                id={fieldId("parent_id")}
                aria-invalid={errorFor("parent_id") ? true : undefined}
                aria-describedby={describedBy}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TOP_LEVEL}>Top-level (home tile)</SelectItem>
                {parents.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field
          {...field("sort_order")}
          label="Sort order"
          hint="Its place among its siblings: lower comes first. 0 to 9999."
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

      <Field {...field("icon_key")} label="Icon" hint={ICON_HINT}>
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
              Off: it's created hidden, and customers don't see it until it's activated.
            </span>
          </span>
        </label>
      )}

      {serverError && serverError.field === null && <FormError message={serverError.message} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || (editing && !dirty)}>
          {editing ? (busy ? "Saving…" : "Save changes") : busy ? "Creating…" : "Create category"}
        </Button>
        {editing && dirty && !busy && baseline && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setForm(categoryFormFrom(baseline));
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
