/**
 * The catalog surface (SVC-430): categories and services, created, edited,
 * deactivated and activated. The contract is the backend's
 * app/schemas/admin_catalog.py and app/services/admin_catalog_service.py (BE #243).
 *
 * The client checks below mirror the backend's rules, so most mistakes never leave
 * the browser. The backend is still the authority: when it refuses, its message is
 * shown under the field it names.
 *
 * On edit only the fields that changed are checked and sent. The backend works the
 * same way, and seeded rows can break today's create rules: "Emergency/last-minute
 * setup" (cctv-light-event) has base_price 0.00, so re-sending it would be refused.
 */
import { ApiError, apiFetch } from "@/lib/api";
import type { AdminRole } from "@/lib/auth";
import { codePointLength } from "@/lib/markdown";
import { formatRupees } from "@/lib/money";
import { parseMoney, parseWhole } from "@/lib/number-input";

// --- Types: app/schemas/admin_catalog.py ---------------------------------------

export const PRICE_UNITS = ["PER_VISIT", "PER_SQFT", "PER_HOUR", "PER_ITEM"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

/** The units a minimum quantity applies to. Required for these, refused for the rest. */
export const UNITS_WITH_MIN_QTY: readonly PriceUnit[] = ["PER_SQFT", "PER_HOUR"];

/** A service in the tree. Money is rupees, as a JSON number. */
export interface CatalogServiceRow {
  id: string;
  category_id: string;
  name: string;
  price_unit: PriceUnit;
  min_qty: number | null;
  base_price: number;
  duration_minutes: number;
  icon_key: string | null;
  is_active: boolean;
  /** Variants a customer can pick. At 0 the service books at base_price. */
  active_variant_count: number;
  /** Bookings requested, accepted, en route or in progress. */
  active_bookings: number;
}

/** A category in the tree. Inactive rows are included. */
export interface CatalogCategoryNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_key: string | null;
  sort_order: number;
  is_active: boolean;
  /** Null: an L1 (a home tile). */
  parent_id: string | null;
  children: CatalogCategoryNode[];
  /** An L2 holds services, and so may an L1 with no sub-categories (Miscellaneous). */
  services: CatalogServiceRow[];
}

export interface CatalogTree {
  categories: CatalogCategoryNode[];
}

export interface CategoryDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_key: string | null;
  sort_order: number;
  is_active: boolean;
  parent_id: string | null;
  created_at: string;
  subcategory_count: number;
  active_subcategory_count: number;
  service_count: number;
  active_service_count: number;
}

/** Read-only here: variants are edited elsewhere. */
export interface ServiceVariantRow {
  id: string;
  label: string;
  subcategory: string | null;
  base_price: number;
  duration_minutes: number | null;
  sort_order: number;
  is_active: boolean;
}

export interface ServiceDetail extends CatalogServiceRow {
  description: string | null;
  created_at: string;
  updated_at: string;
  variants: ServiceVariantRow[];
}

export interface CategoryCreateBody {
  name: string;
  parent_id: string | null;
  sort_order: number;
  icon_key: string | null;
  is_active: boolean;
}

/** No slug and no is_active: the slug never changes, and only (de)activate switches a row. */
export interface CategoryPatch {
  name?: string;
  parent_id?: string | null;
  sort_order?: number;
  icon_key?: string | null;
}

export interface ServiceCreateBody {
  category_id: string;
  name: string;
  description: string | null;
  base_price: number;
  duration_minutes: number;
  price_unit: PriceUnit;
  min_qty: number | null;
  icon_key: string | null;
  is_active: boolean;
}

export interface ServicePatch {
  category_id?: string;
  name?: string;
  description?: string | null;
  base_price?: number;
  duration_minutes?: number;
  price_unit?: PriceUnit;
  min_qty?: number | null;
  icon_key?: string | null;
}

// --- Paths and calls -----------------------------------------------------------

export const CATALOG_PATH = "/admin/catalog";

export function categoryPath(id: string): string {
  return `${CATALOG_PATH}/categories/${encodeURIComponent(id)}`;
}

export function servicePath(id: string): string {
  return `${CATALOG_PATH}/services/${encodeURIComponent(id)}`;
}

const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export function createCategory(body: CategoryCreateBody): Promise<CategoryDetail> {
  return post<CategoryDetail>(`${CATALOG_PATH}/categories`, body);
}

export function patchCategory(id: string, patch: CategoryPatch): Promise<CategoryDetail> {
  return apiFetch<CategoryDetail>(categoryPath(id), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Both are idempotent on the backend. Deactivate is refused while the category isn't empty. */
export function setCategoryActive(id: string, active: boolean): Promise<CategoryDetail> {
  return post<CategoryDetail>(`${categoryPath(id)}/${active ? "activate" : "deactivate"}`);
}

export function createService(body: ServiceCreateBody): Promise<ServiceDetail> {
  return post<ServiceDetail>(`${CATALOG_PATH}/services`, body);
}

export function patchService(id: string, patch: ServicePatch): Promise<ServiceDetail> {
  return apiFetch<ServiceDetail>(servicePath(id), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/**
 * Without confirm, a service with bookings in flight is refused (409, with the
 * count). confirm: true is sent only after the admin has seen that count.
 */
export function deactivateService(id: string, confirm: boolean): Promise<ServiceDetail> {
  return post<ServiceDetail>(`${servicePath(id)}/deactivate`, { confirm });
}

export function activateService(id: string): Promise<ServiceDetail> {
  return post<ServiceDetail>(`${servicePath(id)}/activate`);
}

// --- Roles -----------------------------------------------------------------------

/** Admin and ops write; support reads (the backend 403s its writes). */
export function canEditCatalog(role: AdminRole): boolean {
  return role === "admin" || role === "ops";
}

// --- Labels ------------------------------------------------------------------------

const UNIT_LABELS: Record<PriceUnit, { label: string; per: string; qty: string }> = {
  PER_VISIT: { label: "Per visit", per: "visit", qty: "" },
  PER_SQFT: { label: "Per sq ft", per: "sq ft", qty: "Minimum sq ft" },
  PER_HOUR: { label: "Per hour", per: "hour", qty: "Minimum hours" },
  PER_ITEM: { label: "Per item", per: "item", qty: "" },
};

export const PRICE_UNIT_OPTIONS = PRICE_UNITS.map((value) => ({
  value,
  label: UNIT_LABELS[value].label,
}));

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit as PriceUnit]?.label ?? unit;
}

export const needsMinQty = (unit: string) =>
  (UNITS_WITH_MIN_QTY as readonly string[]).includes(unit);

/** "Minimum sq ft" / "Minimum hours": the min-qty input's label for that unit. */
export function minQtyLabel(unit: string): string {
  return UNIT_LABELS[unit as PriceUnit]?.qty || "Minimum quantity";
}

/** "₹499 / visit", "₹12 / sq ft · min 100". */
export function priceLabel(
  row: Pick<CatalogServiceRow, "base_price" | "price_unit" | "min_qty">,
): string {
  const per = UNIT_LABELS[row.price_unit]?.per ?? row.price_unit;
  const min = row.min_qty !== null && needsMinQty(row.price_unit) ? ` · min ${row.min_qty}` : "";
  return `${formatRupees(row.base_price)} / ${per}${min}`;
}

/** "45 min", "1 hr", "1 hr 30 min". */
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const variantsLabel = (count: number) => plural(count, "active variant", "active variants");
export const bookingsLabel = (count: number) => plural(count, "active booking", "active bookings");

// --- The tree ------------------------------------------------------------------------

/** Every category in the tree, L1s then each one's L2s. */
export function allCategories(categories: CatalogCategoryNode[]): CatalogCategoryNode[] {
  return categories.flatMap((l1) => [l1, ...l1.children]);
}

export function findCategory(
  categories: CatalogCategoryNode[],
  id: string,
): CatalogCategoryNode | undefined {
  return allCategories(categories).find((category) => category.id === id);
}

const matches = (name: string, query: string) => name.toLowerCase().includes(query);

/**
 * The tree narrowed to names containing `query`, any case. A category that matches
 * keeps everything under it; one that doesn't keeps only its matching parts, and
 * goes when nothing under it matches.
 */
export function filterTree(
  categories: CatalogCategoryNode[],
  query: string,
): CatalogCategoryNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return categories;
  const prune = (node: CatalogCategoryNode): CatalogCategoryNode | null => {
    if (matches(node.name, q)) return node;
    const children = node.children.map(prune).filter((c): c is CatalogCategoryNode => c !== null);
    const services = node.services.filter((service) => matches(service.name, q));
    return children.length || services.length ? { ...node, children, services } : null;
  };
  return categories.map(prune).filter((c): c is CatalogCategoryNode => c !== null);
}

/** Counts across the whole tree, for the page's summary line. */
export function treeCounts(categories: CatalogCategoryNode[]): {
  categories: number;
  services: number;
} {
  const all = allCategories(categories);
  return {
    categories: all.length,
    services: all.reduce((sum, category) => sum + category.services.length, 0),
  };
}

export interface CategoryOption {
  id: string;
  label: string;
  isActive: boolean;
}

/** "Name", or "Name (inactive)". */
const optionLabel = (category: CatalogCategoryNode) =>
  category.is_active ? category.name : `${category.name} (inactive)`;

/**
 * Where a service can go, grouped by L1: each L1's sub-categories, or the L1
 * itself when it has none (a category holds sub-categories or services, never
 * both). Inactive ones are listed and labelled; the form refuses them for an
 * active service, as the backend does.
 */
export function serviceCategoryGroups(
  categories: CatalogCategoryNode[],
): { label: string; options: CategoryOption[] }[] {
  return categories.map((l1) => ({
    label: optionLabel(l1),
    options: (l1.children.length ? l1.children : [l1]).map((category) => ({
      id: category.id,
      label: optionLabel(category),
      isActive: category.is_active,
    })),
  }));
}

/**
 * The L1s a category can go under: not itself, and not one that holds services
 * (it can't hold sub-categories too). The catalog has two levels, so only L1s.
 */
export function parentOptions(
  categories: CatalogCategoryNode[],
  selfId: string | null,
): CategoryOption[] {
  return categories
    .filter((l1) => l1.id !== selfId && l1.services.length === 0)
    .map((l1) => ({ id: l1.id, label: optionLabel(l1), isActive: l1.is_active }));
}

// --- Category form ----------------------------------------------------------------

export interface CategoryForm {
  name: string;
  /** "" is top-level. */
  parent_id: string;
  icon_key: string | null;
  sort_order: string;
  is_active: boolean;
}

export type CategoryField = Exclude<keyof CategoryForm, "is_active">;
export const CATEGORY_FIELDS: CategoryField[] = ["name", "parent_id", "icon_key", "sort_order"];

export function emptyCategoryForm(parentId = ""): CategoryForm {
  return { name: "", parent_id: parentId, icon_key: null, sort_order: "0", is_active: true };
}

export function categoryFormFrom(detail: CategoryDetail): CategoryForm {
  return {
    name: detail.name,
    parent_id: detail.parent_id ?? "",
    icon_key: detail.icon_key,
    sort_order: String(detail.sort_order),
    is_active: detail.is_active,
  };
}

export interface CategoryValues {
  name: string;
  parent_id: string | null;
  icon_key: string | null;
  sort_order: number;
  is_active: boolean;
}

export type FormErrors<F extends string> = Partial<Record<F, string>>;
export type Check<V, F extends string> =
  { ok: true; values: V } | { ok: false; errors: FormErrors<F> };

// The backend's bounds (admin_catalog_service.py).
const CATEGORY_NAME = { min: 2, max: 100 };
const SERVICE_NAME = { min: 3, max: 200 };
const SORT_ORDER_MAX = 9999;
export const DESCRIPTION_MAX = 2000;
const DURATION = { min: 15, max: 480 };
const MIN_QTY_MAX = 100_000;
const PRICE_MAX = 1_000_000;

function checkName(raw: string, bounds: { min: number; max: number }): string | null {
  const length = codePointLength(raw.trim());
  if (length === 0) return "Enter a name.";
  if (length < bounds.min || length > bounds.max)
    return `${bounds.min} to ${bounds.max} characters.`;
  return null;
}

export interface CategoryCheckOptions {
  /** Edit only: the stored category. Only fields that differ from it are checked. */
  baseline?: CategoryDetail;
  categories: CatalogCategoryNode[];
}

export function validateCategoryForm(
  form: CategoryForm,
  { baseline, categories }: CategoryCheckOptions,
): Check<CategoryValues, CategoryField> {
  const errors: FormErrors<CategoryField> = {};
  const stored = baseline ? categoryFormFrom(baseline) : null;
  const check = (field: CategoryField) => stored === null || form[field] !== stored[field];

  const name = form.name.trim();
  if (check("name")) {
    const problem = checkName(form.name, CATEGORY_NAME);
    if (problem) errors.name = problem;
    // The slug is made from the name's letters and digits (A–Z, 0–9) on create.
    else if (!baseline && !/[a-z0-9]/i.test(name))
      errors.name =
        "Include at least one letter or digit (A–Z, 0–9): the address is made from them.";
  }

  let sortOrder = baseline?.sort_order ?? 0;
  if (check("sort_order")) {
    const parsed = parseWhole(form.sort_order);
    if (!parsed.ok) errors.sort_order = parsed.error;
    else if (parsed.value === null) errors.sort_order = "Enter a number, 0 or more.";
    else if (parsed.value > SORT_ORDER_MAX) errors.sort_order = `0 to ${SORT_ORDER_MAX}.`;
    else sortOrder = parsed.value;
  }

  const parentId = form.parent_id || null;
  const active = baseline ? baseline.is_active : form.is_active;
  if (check("parent_id") && parentId !== null) {
    const parent = categories.find((l1) => l1.id === parentId);
    if (!parent) errors.parent_id = "Pick a top-level category.";
    else if (active && !parent.is_active)
      errors.parent_id = "That category is inactive; an active category can't go under it.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      name,
      parent_id: parentId,
      icon_key: form.icon_key,
      sort_order: sortOrder,
      is_active: form.is_active,
    },
  };
}

export function categoryCreateBody(values: CategoryValues): CategoryCreateBody {
  return { ...values };
}

/** The PATCH: only what changed. */
export function changedCategoryFields(
  baseline: CategoryDetail,
  values: CategoryValues,
): CategoryPatch {
  const patch: CategoryPatch = {};
  if (values.name !== baseline.name) patch.name = values.name;
  if (values.parent_id !== baseline.parent_id) patch.parent_id = values.parent_id;
  if (values.sort_order !== baseline.sort_order) patch.sort_order = values.sort_order;
  if (values.icon_key !== baseline.icon_key) patch.icon_key = values.icon_key;
  return patch;
}

// --- Service form -------------------------------------------------------------------

export interface ServiceForm {
  name: string;
  category_id: string;
  description: string;
  base_price: string;
  duration_minutes: string;
  price_unit: PriceUnit;
  min_qty: string;
  icon_key: string | null;
  is_active: boolean;
}

export type ServiceField = Exclude<keyof ServiceForm, "is_active">;
export const SERVICE_FIELDS: ServiceField[] = [
  "name",
  "category_id",
  "description",
  "base_price",
  "duration_minutes",
  "price_unit",
  "min_qty",
  "icon_key",
];

export function emptyServiceForm(categoryId = ""): ServiceForm {
  return {
    name: "",
    category_id: categoryId,
    description: "",
    base_price: "",
    duration_minutes: "60",
    price_unit: "PER_VISIT",
    min_qty: "",
    icon_key: null,
    is_active: true,
  };
}

const money = (value: number) => String(Number(value.toFixed(2)));

export function serviceFormFrom(detail: ServiceDetail): ServiceForm {
  return {
    name: detail.name,
    category_id: detail.category_id,
    description: detail.description ?? "",
    base_price: money(detail.base_price),
    duration_minutes: String(detail.duration_minutes),
    price_unit: detail.price_unit,
    min_qty: detail.min_qty === null ? "" : String(detail.min_qty),
    icon_key: detail.icon_key,
    is_active: detail.is_active,
  };
}

export interface ServiceValues {
  name: string;
  category_id: string;
  /** Null when blank: the backend stores a whitespace-only description as none. */
  description: string | null;
  base_price: number;
  duration_minutes: number;
  price_unit: PriceUnit;
  /** Always null for a unit without one, whatever the hidden input still holds. */
  min_qty: number | null;
  icon_key: string | null;
  is_active: boolean;
}

export interface ServiceCheckOptions {
  /** Edit only: the stored service. Only fields that differ from it are checked. */
  baseline?: ServiceDetail;
  categories: CatalogCategoryNode[];
}

export function validateServiceForm(
  form: ServiceForm,
  { baseline, categories }: ServiceCheckOptions,
): Check<ServiceValues, ServiceField> {
  const errors: FormErrors<ServiceField> = {};
  const stored = baseline ? serviceFormFrom(baseline) : null;
  const check = (field: ServiceField) => stored === null || form[field] !== stored[field];

  if (check("name")) {
    const problem = checkName(form.name, SERVICE_NAME);
    if (problem) errors.name = problem;
  }

  const active = baseline ? baseline.is_active : form.is_active;
  if (check("category_id")) {
    const category = form.category_id ? findCategory(categories, form.category_id) : undefined;
    if (!category) errors.category_id = "Pick a category.";
    else if (category.children.length > 0)
      errors.category_id = "That category has sub-categories; pick one of them.";
    else if (active && !category.is_active)
      errors.category_id = "That category is inactive; an active service can't go in it.";
  }

  if (check("description") && codePointLength(form.description) > DESCRIPTION_MAX)
    errors.description = `At most ${DESCRIPTION_MAX} characters.`;

  let basePrice = baseline?.base_price ?? 0;
  if (check("base_price")) {
    const parsed = parseMoney(form.base_price);
    if (!parsed.ok) errors.base_price = parsed.error;
    else if (parsed.value === null) errors.base_price = "Enter the price.";
    else if (parsed.value <= 0) errors.base_price = "More than ₹0.";
    else if (parsed.value > PRICE_MAX) errors.base_price = "At most ₹10,00,000.";
    else basePrice = parsed.value;
  }

  let duration = baseline?.duration_minutes ?? 60;
  if (check("duration_minutes")) {
    const parsed = parseWhole(form.duration_minutes);
    if (!parsed.ok) errors.duration_minutes = parsed.error;
    else if (parsed.value === null || parsed.value < DURATION.min || parsed.value > DURATION.max)
      errors.duration_minutes = `${DURATION.min} to ${DURATION.max} minutes.`;
    else duration = parsed.value;
  }

  let minQty: number | null = null;
  if (needsMinQty(form.price_unit)) {
    if (check("min_qty") || check("price_unit")) {
      const parsed = parseWhole(form.min_qty);
      if (!parsed.ok) errors.min_qty = parsed.error;
      else if (parsed.value === null)
        errors.min_qty = `Required for ${unitLabel(form.price_unit).toLowerCase()}.`;
      else if (parsed.value < 1 || parsed.value > MIN_QTY_MAX)
        errors.min_qty = `1 to ${MIN_QTY_MAX.toLocaleString("en-IN")}.`;
      else minQty = parsed.value;
    } else {
      minQty = baseline!.min_qty;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      name: form.name.trim(),
      category_id: form.category_id,
      description: form.description.trim() === "" ? null : form.description,
      base_price: basePrice,
      duration_minutes: duration,
      price_unit: form.price_unit,
      min_qty: minQty,
      icon_key: form.icon_key,
      is_active: form.is_active,
    },
  };
}

export function serviceCreateBody(values: ServiceValues): ServiceCreateBody {
  return { ...values };
}

/**
 * The PATCH: only what changed. A move off PER_SQFT / PER_HOUR sends
 * min_qty: null with it, which the backend needs in the same save.
 */
export function changedServiceFields(baseline: ServiceDetail, values: ServiceValues): ServicePatch {
  const patch: ServicePatch = {};
  if (values.name !== baseline.name) patch.name = values.name;
  if (values.category_id !== baseline.category_id) patch.category_id = values.category_id;
  if (values.description !== (baseline.description ?? null)) patch.description = values.description;
  if (values.base_price !== baseline.base_price) patch.base_price = values.base_price;
  if (values.duration_minutes !== baseline.duration_minutes)
    patch.duration_minutes = values.duration_minutes;
  if (values.price_unit !== baseline.price_unit) patch.price_unit = values.price_unit;
  if (values.min_qty !== baseline.min_qty) patch.min_qty = values.min_qty;
  if (values.icon_key !== baseline.icon_key) patch.icon_key = values.icon_key;
  return patch;
}

// --- Errors ----------------------------------------------------------------------

// The backend's messages name columns; these are the words the forms use.
const WORDS: [RegExp, string][] = [
  [/\bbase_price\b/g, "price"],
  [/\bduration_minutes\b/g, "duration"],
  [/\bmin_qty\b/g, "minimum quantity"],
  [/\bprice_unit\b/g, "price unit"],
  [/\bsort_order\b/g, "sort order"],
  [/\bicon_key\b/g, "icon"],
  [/\bcategory_id\b/g, "category"],
  [/\bparent_id\b/g, "parent"],
  [/\bPER_VISIT\b/g, "per visit"],
  [/\bPER_SQFT\b/g, "per sq ft"],
  [/\bPER_HOUR\b/g, "per hour"],
  [/\bPER_ITEM\b/g, "per item"],
];

function humanize(message: string): string {
  const worded = WORDS.reduce((text, [pattern, word]) => text.replace(pattern, word), message);
  return worded.charAt(0).toUpperCase() + worded.slice(1);
}

const count = (value: unknown) => (typeof value === "number" && value >= 0 ? value : null);

/** CATEGORY_NOT_EMPTY's counts, when the refusal is one. */
export function notEmptyCounts(err: unknown): { services: number; subcategories: number } | null {
  if (!(err instanceof ApiError) || err.code !== "CATEGORY_NOT_EMPTY") return null;
  return {
    services: count(err.details?.active_services) ?? 0,
    subcategories: count(err.details?.active_subcategories) ?? 0,
  };
}

/** SERVICE_HAS_ACTIVE_BOOKINGS's count, when the refusal is one. */
export function activeBookingsCount(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.code !== "SERVICE_HAS_ACTIVE_BOOKINGS") return null;
  return count(err.details?.active_bookings) ?? 1;
}

export function notEmptyMessage(counts: { services: number; subcategories: number }): string {
  const parts = [
    counts.services ? plural(counts.services, "active service", "active services") : null,
    counts.subcategories
      ? plural(counts.subcategories, "active sub-category", "active sub-categories")
      : null,
  ].filter(Boolean);
  return `It still holds ${parts.join(" and ") || "active items"}. Deactivate or move them first.`;
}

/** What a failed write says. A 409's or 422's own message wins, so client and server can't drift. */
export function catalogErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Your role can't change the catalog.";
    if (err.code === "CATEGORY_NOT_FOUND")
      return "This category no longer exists. Reload the page.";
    if (err.code === "SERVICE_NOT_FOUND") return "This service no longer exists. Reload the page.";
    const empty = notEmptyCounts(err);
    if (empty) return notEmptyMessage(empty);
    if (err.status === 409 && err.message) return err.message;
    if (err.status === 422 && err.code === "CATALOG_INVALID" && err.message)
      return humanize(err.message);
    if (err.status === 422)
      return "The server didn't accept a value. Check the form and try again.";
  }
  return "Couldn't save. Try again.";
}

/** The form field a refusal names, when it's one of `fields`. Anything else is form-level. */
export function catalogErrorField<F extends string>(err: unknown, fields: readonly F[]): F | null {
  if (!(err instanceof ApiError)) return null;
  const field =
    err.status === 409 && err.code === "CATALOG_NAME_TAKEN"
      ? "name"
      : err.status === 422 && err.code === "CATALOG_INVALID"
        ? err.details?.field
        : null;
  return typeof field === "string" && (fields as readonly string[]).includes(field)
    ? (field as F)
    : null;
}
