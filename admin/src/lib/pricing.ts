/**
 * The pricing config surface (SVC-428): per-category pricing columns and the
 * global ranking formula. The contract is the backend's app/schemas/admin_pricing.py
 * and app/services/admin_pricing_service.py (BE #239).
 *
 * The values are inert until the marketplace stories read them (SVC-406). The
 * client checks below mirror the backend's so most mistakes never leave the
 * browser. The backend is still the authority: when it refuses, its message is
 * the one shown.
 */
import { ApiError, apiFetch } from "@/lib/api";
import type { AdminRole } from "@/lib/auth";
import { formatRupees } from "@/lib/money";

// --- Types: app/schemas/admin_pricing.py -------------------------------------

/** GET /admin/pricing/categories: one category. L1 rows have no parent. */
export interface CategoryPricingRow {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  parent_name: string | null;
  sort_order: number;
  is_active: boolean;
  is_sensitive: boolean;
  /** Rupees. Null: no reference price yet. */
  reference_price: number | null;
  /** ± percent around the reference. Null unless the category is sensitive. */
  bounds_pct: number | null;
  platform_commission_pct: number;
  /** Rupees: the commission floor. */
  platform_commission_min: number;
  commission_gst_pct: number;
}

export type NumericField =
  | "reference_price"
  | "bounds_pct"
  | "platform_commission_pct"
  | "platform_commission_min"
  | "commission_gst_pct";

export type CategoryField = "is_sensitive" | NumericField;

/** PATCH /admin/pricing/categories/{id}: any subset of the six fields. */
export type CategoryPatch = Partial<Pick<CategoryPricingRow, CategoryField>>;

/** GET /admin/pricing/config: one key. `value` is per key, so it's read defensively. */
export interface PricingConfigRow {
  key: string;
  value: unknown;
  updated_at: string;
  /** Null on the migration's seed rows. */
  updated_by: string | null;
}

export const WEIGHT_KEYS = [
  "rating",
  "price_vs_ref",
  "distance",
  "reliability",
  "activity",
] as const;
export type WeightKey = (typeof WEIGHT_KEYS)[number];
export type RankingWeights = Record<WeightKey, number>;

export const WEIGHT_LABELS: Record<WeightKey, string> = {
  rating: "Rating",
  price_vs_ref: "Price vs reference",
  distance: "Distance",
  reliability: "Reliability",
  activity: "Recent activity",
};

export const INT_CONFIG_KEYS = [
  "boost_window_days",
  "boost_window_jobs",
  "sheet_ttl_seconds",
] as const;
export type IntConfigKey = (typeof INT_CONFIG_KEYS)[number];

// --- Paths and calls ---------------------------------------------------------

export const CATEGORIES_PATH = "/admin/pricing/categories";
export const CONFIG_PATH = "/admin/pricing/config";

export function categoryPath(id: string): string {
  return `${CATEGORIES_PATH}/${encodeURIComponent(id)}`;
}

export function configPath(key: string): string {
  return `${CONFIG_PATH}/${encodeURIComponent(key)}`;
}

export function patchCategory(id: string, patch: CategoryPatch): Promise<CategoryPricingRow> {
  return apiFetch<CategoryPricingRow>(categoryPath(id), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function patchConfig(key: string, value: unknown): Promise<PricingConfigRow> {
  return apiFetch<PricingConfigRow>(configPath(key), {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
}

// --- Roles ---------------------------------------------------------------------

/** Admin and ops edit; support reads (the backend 403s its PATCHes). */
export function canEditPricing(role: AdminRole): boolean {
  return role === "admin" || role === "ops";
}

// --- The category table --------------------------------------------------------

export const FIELD_LABELS: Record<CategoryField, string> = {
  is_sensitive: "Sensitive",
  reference_price: "Reference",
  bounds_pct: "Bounds",
  platform_commission_pct: "Commission",
  platform_commission_min: "Floor",
  commission_gst_pct: "GST",
};

/** The editable number columns, in table order. */
export const NUMERIC_FIELDS: NumericField[] = [
  "reference_price",
  "bounds_pct",
  "platform_commission_pct",
  "platform_commission_min",
  "commission_gst_pct",
];

export type CategoryItem =
  /** An L1 with children: a heading, no values of its own. */
  | { kind: "group"; row: CategoryPricingRow }
  /** Anything with its own editable values: an L2, or an L1 with no children. */
  | { kind: "row"; row: CategoryPricingRow; nested: boolean };

/**
 * The rows as the table shows them. The backend already orders each L1 before
 * its L2s. An L1 services point at directly (Miscellaneous, with no children)
 * is a row like any L2, so its values stay editable.
 */
export function groupCategories(rows: CategoryPricingRow[]): CategoryItem[] {
  const parents = new Set(rows.map((row) => row.parent_id).filter(Boolean));
  return rows.map((row) =>
    row.parent_id === null && parents.has(row.id)
      ? { kind: "group", row }
      : { kind: "row", row, nested: row.parent_id !== null },
  );
}

function trimNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** A cell as the table shows it. */
export function formatCell(field: NumericField, value: number | null): string {
  if (value === null) return "—";
  switch (field) {
    case "reference_price":
    case "platform_commission_min":
      return formatRupees(value);
    case "bounds_pct":
      return `±${trimNumber(value)}%`;
    default:
      return `${trimNumber(value)}%`;
  }
}

/** A cell's value as its input starts: rupees, never paise; a bare number. */
export function inputText(value: number | null): string {
  return value === null ? "" : trimNumber(value);
}

// Mirrors the backend's _MONEY_LIMIT (Numeric(10, 2)).
const MONEY_LIMIT = 100_000_000;

export type ParseResult = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * A typed cell, checked the way the backend will check it. A stray ₹, %, ± or
 * thousands comma is accepted, so a value can be typed as the table shows it.
 * An empty reference price means "none" and saves null.
 */
export function parseCell(field: NumericField, text: string): ParseResult {
  const cleaned = text.replace(/[₹%±,\s]/g, "");
  if (cleaned === "") {
    if (field === "reference_price") return { ok: true, value: null };
    if (field === "bounds_pct") return { ok: false, error: "A sensitive category needs bounds." };
    return { ok: false, error: "Enter a value." };
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) {
    return { ok: false, error: "Enter a number, 0 or more." };
  }
  if (/\.\d{3,}$/.test(cleaned)) {
    return { ok: false, error: "At most 2 decimal places." };
  }
  const value = Number(cleaned);
  switch (field) {
    case "reference_price":
      if (value <= 0 || value >= MONEY_LIMIT) {
        return { ok: false, error: "More than ₹0, or leave it empty." };
      }
      break;
    case "platform_commission_min":
      if (value >= MONEY_LIMIT) return { ok: false, error: "That's too large." };
      break;
    case "bounds_pct":
      if (value <= 0 || value > 100) return { ok: false, error: "More than 0 and at most 100." };
      break;
    default:
      if (value > 100) return { ok: false, error: "From 0 to 100." };
  }
  return { ok: true, value };
}

/** The PATCH for one edited number cell. */
export function cellPayload(field: NumericField, value: number | null): CategoryPatch {
  return { [field]: value };
}

/**
 * The PATCH for the Sensitive toggle. Turning it on needs bounds in the same
 * body (the backend 422s {is_sensitive: true} alone); turning it off clears
 * bounds server-side, so nothing else is sent.
 */
export function sensitivePayload(on: true, boundsPct: number): CategoryPatch;
export function sensitivePayload(on: false): CategoryPatch;
export function sensitivePayload(on: boolean, boundsPct?: number): CategoryPatch {
  return on ? { is_sensitive: true, bounds_pct: boundsPct } : { is_sensitive: false };
}

/** Every field a PATCH changes, the server-side bounds clear included. */
export function affectedFields(patch: CategoryPatch): CategoryField[] {
  const fields = Object.keys(patch) as CategoryField[];
  if (patch.is_sensitive === false && !fields.includes("bounds_pct")) {
    fields.push("bounds_pct");
  }
  return fields;
}

/** The row as the save will leave it: the optimistic copy. */
export function applyPatch(row: CategoryPricingRow, patch: CategoryPatch): CategoryPricingRow {
  const next = { ...row, ...patch };
  if (patch.is_sensitive === false) next.bounds_pct = null;
  return next;
}

/** Whether a PATCH would change anything. A no-change save isn't sent. */
export function changesRow(row: CategoryPricingRow, patch: CategoryPatch): boolean {
  return affectedFields(patch).some((field) => applyPatch(row, patch)[field] !== row[field]);
}

/** Copies `fields` from `source` onto `target`. */
export function withFields(
  target: CategoryPricingRow,
  source: CategoryPricingRow,
  fields: CategoryField[],
): CategoryPricingRow {
  const next = { ...target };
  for (const field of fields) {
    (next as Record<CategoryField, unknown>)[field] = source[field];
  }
  return next;
}

// --- The formula -----------------------------------------------------------------

// The backend's WEIGHT_SUM_TOLERANCE, with its epsilon: float sums land a hair outside.
const WEIGHT_TOLERANCE = 0.01 + 1e-9;

export function weightSum(weights: Record<WeightKey, number | null>): number {
  return WEIGHT_KEYS.reduce((sum, key) => sum + (weights[key] ?? 0), 0);
}

/** 1.00 ± 0.01, the backend's rule. */
export function weightsSumOk(sum: number): boolean {
  return Math.abs(sum - 1) <= WEIGHT_TOLERANCE;
}

/** One weight, 0 to 1. Null when it isn't one. */
export function parseWeight(text: string): number | null {
  const cleaned = text.trim();
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value >= 0 && value <= 1 ? value : null;
}

/** The stored weights, or null if the row isn't the five numbers it should be. */
export function readWeights(value: unknown): RankingWeights | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const weights = {} as RankingWeights;
  for (const key of WEIGHT_KEYS) {
    const weight = record[key];
    if (typeof weight !== "number" || !Number.isFinite(weight)) return null;
    weights[key] = weight;
  }
  return weights;
}

// Mirrors the backend's _INT_CONFIG_MAX.
const INT_CONFIG_MAX = 2_147_483_647;

/** A boost window or TTL: a whole number greater than 0. Null when it isn't one. */
export function parseWholeNumber(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 && value <= INT_CONFIG_MAX ? value : null;
}

const IST_DATE = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
});

/** "Last changed" shows the IST day only: updated_by is a bare id with no name lookup. */
export function formatIstDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : IST_DATE.format(date);
}

// --- Errors ----------------------------------------------------------------------

// The backend's messages name columns and keys; these are the words the screen uses.
const WORDS: [RegExp, string][] = [
  [/\bplatform_commission_pct\b/g, "commission %"],
  [/\bplatform_commission_min\b/g, "commission floor"],
  [/\bcommission_gst_pct\b/g, "GST %"],
  [/\breference_price\b/g, "reference price"],
  [/\bbounds_pct\b/g, "bounds"],
  [/\branking_weights\b/g, "ranking weights"],
  [/\bboost_window_days\b/g, "boost window days"],
  [/\bboost_window_jobs\b/g, "boost window jobs"],
  [/\bsheet_ttl_seconds\b/g, "sheet TTL"],
  [/\bprice_vs_ref\b/g, "price vs reference"],
];

function humanizeMessage(message: string): string {
  const worded = WORDS.reduce((text, [pattern, word]) => text.replace(pattern, word), message);
  return worded.charAt(0).toUpperCase() + worded.slice(1);
}

/** What a failed save says. A 422's own message wins, so client and server can't drift. */
export function pricingErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Your role can't change pricing.";
    if (err.status === 404) return "This no longer exists. Reload the page.";
    if (err.status === 422 && err.message) return humanizeMessage(err.message);
  }
  return "Couldn't save. Try again.";
}

/** The category column a 422 names, when it names one. */
export function errorField(err: unknown): CategoryField | null {
  if (!(err instanceof ApiError) || err.status !== 422) return null;
  const field = err.details?.field;
  return typeof field === "string" && field in FIELD_LABELS ? (field as CategoryField) : null;
}
