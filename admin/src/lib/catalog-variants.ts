/**
 * The variant editor's rules (SVC-481). The contract is the backend's
 * app/services/admin_variant_service.py (BE #281); the client checks mirror it so
 * most mistakes never leave the browser, and the backend stays the authority.
 *
 * - The commission is entered as a percent and the backend stores the amounts.
 *   The field is prefilled with the row's commission_pct (2 dp), and is sent only
 *   when the admin changed it. The backend would treat the shown value as
 *   "unchanged" too, but the editor doesn't lean on that.
 * - A price change on its own keeps the variant's EXACT stored ratio
 *   (platform_commission / base_price, e.g. 240 / 799 = 30.0375%), not the 2 dp
 *   percent shown. The live split preview follows the same rule, so it shows what
 *   will be stored.
 * - Edit sends only what changed, as the service form does.
 * - Customer GST is read-only and never sent.
 */
import { ApiError } from "@/lib/api";
import { codePointLength } from "@/lib/markdown";
import { parseMoney, parseWhole } from "@/lib/number-input";
import {
  DURATION,
  PRICE_MAX,
  SORT_ORDER_MAX,
  type Check,
  type FormErrors,
  type ServiceVariantRow,
  type VariantCreateBody,
  type VariantPatch,
  type VariantPriceImpact,
} from "@/lib/catalog";

export interface VariantForm {
  label: string;
  base_price: string;
  commission_pct: string;
  /** "" : the service's duration applies. */
  duration_minutes: string;
  /** "" on create: last. */
  sort_order: string;
}

export type VariantField = keyof VariantForm;
export const VARIANT_FIELDS: VariantField[] = [
  "label",
  "base_price",
  "commission_pct",
  "duration_minutes",
  "sort_order",
];

const LABEL = { min: 1, max: 200 };
const PCT_LIMIT = 100;

/** 30.04 → "30.04", 30 → "30", 799 → "799". */
const decimal = (value: number) => String(Number(value.toFixed(2)));

export function emptyVariantForm(): VariantForm {
  return { label: "", base_price: "", commission_pct: "", duration_minutes: "", sort_order: "" };
}

export function variantFormFrom(row: ServiceVariantRow): VariantForm {
  return {
    label: row.label,
    base_price: decimal(row.base_price),
    commission_pct: decimal(row.commission_pct),
    duration_minutes: row.duration_minutes === null ? "" : String(row.duration_minutes),
    sort_order: String(row.sort_order),
  };
}

/** A percent, 0 or more and below 100, at most 2 decimal places. */
export function parsePct(text: string): { ok: true; value: number } | { ok: false; error: string } {
  const cleaned = text.replace(/[%\s]/g, "");
  if (cleaned === "") return { ok: false, error: "Enter the commission %." };
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return { ok: false, error: "Enter a number." };
  if (/\.\d{3,}$/.test(cleaned)) return { ok: false, error: "At most 2 decimal places." };
  const value = Number(cleaned);
  if (value >= PCT_LIMIT) return { ok: false, error: "At least 0 and below 100." };
  return { ok: true, value };
}

export interface VariantValues {
  label: string;
  base_price: number;
  commission_pct: number;
  /** Null: not set (create: the service's duration; edit: unchanged). */
  duration_minutes: number | null;
  sort_order: number | null;
}

/**
 * Edit (baseline given): only fields that differ from the row are checked, so a
 * seeded value that breaks today's rules saves fine while it isn't touched.
 */
export function validateVariantForm(
  form: VariantForm,
  baseline?: ServiceVariantRow,
): Check<VariantValues, VariantField> {
  const errors: FormErrors<VariantField> = {};
  const stored = baseline ? variantFormFrom(baseline) : null;
  const check = (field: VariantField) => stored === null || form[field] !== stored[field];

  const label = form.label.trim();
  if (check("label")) {
    const length = codePointLength(label);
    if (length === 0) errors.label = "Enter a label.";
    else if (length > LABEL.max) errors.label = `At most ${LABEL.max} characters.`;
  }

  let price = baseline?.base_price ?? 0;
  if (check("base_price")) {
    const parsed = parseMoney(form.base_price);
    if (!parsed.ok) errors.base_price = parsed.error;
    else if (parsed.value === null) errors.base_price = "Enter the price.";
    else if (parsed.value <= 0) errors.base_price = "More than ₹0.";
    else if (parsed.value > PRICE_MAX) errors.base_price = "At most ₹10,00,000.";
    else price = parsed.value;
  }

  let pct = baseline?.commission_pct ?? 0;
  if (check("commission_pct")) {
    const parsed = parsePct(form.commission_pct);
    if (!parsed.ok) errors.commission_pct = parsed.error;
    else pct = parsed.value;
  }

  let duration: number | null = null;
  if (check("duration_minutes")) {
    const parsed = parseWhole(form.duration_minutes);
    if (!parsed.ok) errors.duration_minutes = parsed.error;
    else if (parsed.value === null) {
      // The backend refuses null on edit: a set duration can't go back to "the service's".
      if (baseline)
        errors.duration_minutes = `It can't be cleared. ${DURATION.min} to ${DURATION.max} minutes.`;
    } else if (parsed.value < DURATION.min || parsed.value > DURATION.max)
      errors.duration_minutes = `${DURATION.min} to ${DURATION.max} minutes.`;
    else duration = parsed.value;
  }

  let sortOrder: number | null = null;
  if (check("sort_order")) {
    const parsed = parseWhole(form.sort_order);
    if (!parsed.ok) errors.sort_order = parsed.error;
    else if (parsed.value === null) {
      if (baseline) errors.sort_order = `Enter a number, 0 to ${SORT_ORDER_MAX}.`;
    } else if (parsed.value > SORT_ORDER_MAX) errors.sort_order = `0 to ${SORT_ORDER_MAX}.`;
    else sortOrder = parsed.value;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      label,
      base_price: price,
      commission_pct: pct,
      duration_minutes: duration,
      sort_order: sortOrder,
    },
  };
}

export function variantCreateBody(values: VariantValues): VariantCreateBody {
  const body: VariantCreateBody = {
    label: values.label,
    base_price: values.base_price,
    commission_pct: values.commission_pct,
  };
  if (values.duration_minutes !== null) body.duration_minutes = values.duration_minutes;
  if (values.sort_order !== null) body.sort_order = values.sort_order;
  return body;
}

/**
 * The PATCH: only what changed. commission_pct goes only when the admin changed
 * the prefilled percent, so a price-only edit keeps the exact stored ratio.
 */
export function changedVariantFields(
  baseline: ServiceVariantRow,
  values: VariantValues,
): VariantPatch {
  const patch: VariantPatch = {};
  if (values.label !== baseline.label) patch.label = values.label;
  if (values.base_price !== baseline.base_price) patch.base_price = values.base_price;
  if (values.commission_pct !== baseline.commission_pct)
    patch.commission_pct = values.commission_pct;
  if (values.duration_minutes !== null && values.duration_minutes !== baseline.duration_minutes)
    patch.duration_minutes = values.duration_minutes;
  if (values.sort_order !== null && values.sort_order !== baseline.sort_order)
    patch.sort_order = values.sort_order;
  return patch;
}

// --- The split preview ---------------------------------------------------------
// Integer paise and BigInt, rounded half up: the backend's Decimal rule
// (app/services/commission.py), with no float drift.

const toPaise = (rupees: number) => BigInt(Math.round(rupees * 100));

/** num / den rounded half up, both ≥ 0, den > 0. */
const divHalfUp = (num: bigint, den: bigint) => (2n * num + den) / (2n * den);

export interface Split {
  commission: number;
  payout: number;
}

const split = (pricePaise: bigint, commissionPaise: bigint): Split => ({
  commission: Number(commissionPaise) / 100,
  payout: Number(pricePaise - commissionPaise) / 100,
});

/** split_at_pct: price × pct / 100, rounded half up to paise; the payout is the rest. */
export function splitAtPct(price: number, pct: number): Split {
  const p = toPaise(price);
  return split(p, divHalfUp(p * BigInt(Math.round(pct * 100)), 10_000n));
}

/**
 * repriced_split: the row's exact ratio at the new price. Null for a row priced
 * 0 (the backend falls back to its legacy percent, which the client can't see).
 */
export function repricedSplit(row: ServiceVariantRow, price: number): Split | null {
  const base = toPaise(row.base_price);
  if (base === 0n) return null;
  const p = toPaise(price);
  return split(p, divHalfUp(p * toPaise(row.platform_commission), base));
}

/**
 * What the backend will store for the form as typed, or null while the price or
 * percent doesn't parse. Create, or a changed percent: split_at_pct. Otherwise the
 * row's exact ratio.
 */
export function previewSplit(form: VariantForm, baseline?: ServiceVariantRow): Split | null {
  const price = parseMoney(form.base_price);
  if (!price.ok || price.value === null || price.value <= 0) return null;
  const pct = parsePct(form.commission_pct);
  if (!pct.ok) return null;
  if (!baseline || pct.value !== baseline.commission_pct) return splitAtPct(price.value, pct.value);
  return repricedSplit(baseline, price.value);
}

// --- The confirm steps -----------------------------------------------------------

const pros = (count: number) => `${count} ${count === 1 ? "pro" : "pros"}`;

/** The price-impact step's lines. All-zero movement (incl. a category with no range) is one line. */
export function impactLines(impact: VariantPriceImpact): string[] {
  const lines: string[] = [];
  if (impact.moving_out === 0 && impact.moving_in === 0) {
    lines.push("No pros move in or out of the recommended range.");
  } else {
    lines.push(
      `${pros(impact.moving_out)} ${impact.moving_out === 1 ? "moves" : "move"} outside the recommended range, ${impact.moving_in} ${impact.moving_in === 1 ? "moves" : "move"} back in.`,
    );
  }
  lines.push(
    impact.sp_prices === 0
      ? "No pros have a price on this variant yet."
      : `${pros(impact.sp_prices)} ${impact.sp_prices === 1 ? "has" : "have"} a price on this variant. Their prices and existing bookings don't change.`,
  );
  return lines;
}

export interface NoticeRequired {
  message: string;
  oldPct: number | null;
  newPct: number | null;
  noticeDays: number;
}

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** COMMISSION_INCREASE_NEEDS_NOTICE's message and percents, when the refusal is one. */
export function noticeRequired(err: unknown): NoticeRequired | null {
  if (!(err instanceof ApiError) || err.code !== "COMMISSION_INCREASE_NEEDS_NOTICE") return null;
  return {
    message: err.message || "Give pros at least 14 days' notice before saving",
    oldPct: num(err.details?.old_pct),
    newPct: num(err.details?.new_pct),
    noticeDays: num(err.details?.notice_days) ?? 14,
  };
}

/** "30.04%", "35%". */
export const pctLabel = (pct: number) => `${decimal(pct)}%`;
