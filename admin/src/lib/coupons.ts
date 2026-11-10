/**
 * The coupon surface (SVC-429): list, create, detail with edit, deactivate and
 * usage. The contract is the backend's app/schemas/admin_coupons.py and
 * app/services/admin_coupon_service.py (BE #241).
 *
 * The client checks below mirror the backend's _validate, so most mistakes never
 * leave the browser. The backend is still the authority: when it refuses, its
 * message is the one shown, under the field it names.
 */
import { ApiError, apiFetch } from "@/lib/api";
import type { AdminRole } from "@/lib/auth";
import { formatIst } from "@/lib/bookings";
import { formatRupees } from "@/lib/money";

// --- Types: app/schemas/admin_coupons.py -------------------------------------

export type DiscountType = "percent" | "flat";

/** One per coupon; the backend picks the first that matches, in this order. */
export const COUPON_STATUSES = ["inactive", "expired", "exhausted", "scheduled", "active"] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];

/** GET /admin/coupons: one coupon. Money is rupees, as a JSON number. */
export interface CouponRow {
  id: string;
  /** Uppercase. Old codes may hold characters the create rule refuses. */
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  max_discount: number | null;
  min_order_amount: number | null;
  valid_from: string;
  valid_until: string;
  /** Null: unlimited. */
  usage_limit: number | null;
  usage_limit_per_user: number;
  is_active: boolean;
  /** Set on a personal (referral) coupon. */
  user_id: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  /** Redemption rows, a cancelled booking's included: the count the limit uses. */
  usage_count: number;
  status: CouponStatus;
  created_at: string;
}

export interface CouponListPage {
  items: CouponRow[];
  total: number;
  page: number;
  per_page: number;
}

export interface CouponRedemption {
  booking_id: string;
  booking_status: string;
  redeemed_at: string;
  discount_applied: number;
  customer_id: string;
  customer_name: string | null;
}

/** GET /admin/coupons/{code}: the row, the total discount given, the latest 20 uses. */
export interface CouponDetail extends CouponRow {
  total_discount: number;
  recent_redemptions: CouponRedemption[];
}

/** POST /admin/coupons. Global coupons only; valid_from left out means "now". */
export interface CouponCreateBody {
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  max_discount?: number;
  min_order_amount?: number;
  valid_from?: string;
  valid_until: string;
  usage_limit?: number;
  usage_limit_per_user: number;
  is_active: boolean;
}

/** PATCH /admin/coupons/{code}. Null only clears max_discount, min_order_amount or usage_limit. */
export interface CouponPatch {
  discount_type?: DiscountType;
  discount_value?: number;
  max_discount?: number | null;
  min_order_amount?: number | null;
  valid_from?: string;
  valid_until?: string;
  usage_limit?: number | null;
  usage_limit_per_user?: number;
}

// --- Paths and calls ---------------------------------------------------------

export const COUPONS_PATH = "/admin/coupons";
export const COUPONS_PAGE_SIZE = 50;

/** {code} is matched case-insensitively. Encoded: an old code may hold anything. */
export function couponPath(code: string): string {
  return `${COUPONS_PATH}/${encodeURIComponent(code)}`;
}

export interface CouponsSearch {
  status?: CouponStatus;
  q?: string;
  personal?: boolean;
  page?: number;
}

export function couponsListPath(search: CouponsSearch): string {
  const params = new URLSearchParams();
  if (search.status) params.set("status", search.status);
  if (search.q) params.set("q", search.q);
  if (search.personal !== undefined) params.set("personal", String(search.personal));
  if (search.page && search.page > 1) params.set("page", String(search.page));
  params.set("per_page", String(COUPONS_PAGE_SIZE));
  return `${COUPONS_PATH}?${params}`;
}

/**
 * Anything unknown becomes undefined, explicitly: the router merges the raw URL
 * over what this returns, so leaving a bad key out would keep it.
 */
export function validateCouponsSearch(raw: Record<string, unknown>): CouponsSearch {
  const q = typeof raw.q === "string" ? raw.q.trim().slice(0, 32) : "";
  return {
    status: (COUPON_STATUSES as readonly unknown[]).includes(raw.status)
      ? (raw.status as CouponStatus)
      : undefined,
    q: q || undefined,
    personal:
      raw.personal === true || raw.personal === "true"
        ? true
        : raw.personal === false || raw.personal === "false"
          ? false
          : undefined,
    page:
      typeof raw.page === "number" && Number.isSafeInteger(raw.page) && raw.page > 1
        ? raw.page
        : undefined,
  };
}

export function hasCouponFilters(search: CouponsSearch): boolean {
  return Boolean(search.status || search.q || search.personal !== undefined);
}

export function createCoupon(body: CouponCreateBody): Promise<CouponRow> {
  return apiFetch<CouponRow>(COUPONS_PATH, { method: "POST", body: JSON.stringify(body) });
}

export function patchCoupon(code: string, patch: CouponPatch): Promise<CouponRow> {
  return apiFetch<CouponRow>(couponPath(code), { method: "PATCH", body: JSON.stringify(patch) });
}

/** Deactivate or activate. Both are idempotent on the backend. */
export function setCouponActive(code: string, active: boolean): Promise<CouponRow> {
  return apiFetch<CouponRow>(`${couponPath(code)}/${active ? "activate" : "deactivate"}`, {
    method: "POST",
  });
}

// --- Roles -----------------------------------------------------------------------

/** Admin and ops write; support reads (the backend 403s its writes). */
export function canEditCoupons(role: AdminRole): boolean {
  return role === "admin" || role === "ops";
}

// --- Labels ------------------------------------------------------------------------

function trimNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** "10% · cap ₹150", "10% · no cap", "₹100 off". */
export function discountLabel(
  row: Pick<CouponRow, "discount_type" | "discount_value" | "max_discount">,
): string {
  if (row.discount_type === "flat") return `${formatRupees(row.discount_value)} off`;
  const cap = row.max_discount === null ? "no cap" : `cap ${formatRupees(row.max_discount)}`;
  return `${trimNumber(row.discount_value)}% · ${cap}`;
}

export function minOrderLabel(amount: number | null): string {
  return amount === null || amount === 0 ? "No minimum" : `Min order ${formatRupees(amount)}`;
}

/** "3 / 10", or "3 / ∞" with no limit. */
export function usageLabel(row: Pick<CouponRow, "usage_count" | "usage_limit">): string {
  return `${row.usage_count} / ${row.usage_limit ?? "∞"}`;
}

const STATUS_LABELS: Record<CouponStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  inactive: "Inactive",
  expired: "Expired",
  // The global limit only: the per-user limit is not a coupon status.
  exhausted: "Limit reached",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as CouponStatus] ?? status;
}

/** The filter's order: the everyday ones first. */
export const STATUS_OPTIONS: { value: CouponStatus; label: string }[] = (
  ["active", "scheduled", "expired", "exhausted", "inactive"] as const
).map((value) => ({ value, label: STATUS_LABELS[value] }));

export function validityLabel(row: Pick<CouponRow, "valid_from" | "valid_until">): string {
  return `${formatIst(row.valid_from)} – ${formatIst(row.valid_until)}`;
}

export function ownerLabel(row: Pick<CouponRow, "owner_name" | "owner_phone">): string {
  return row.owner_name?.trim() || row.owner_phone || "unknown owner";
}

/** What the page says after Activate: active isn't always usable. */
export function activatedNotice(row: CouponRow): string {
  switch (row.status) {
    case "active":
      return `${row.code} is active again.`;
    case "scheduled":
      return `${row.code} is activated. Customers can apply it from ${formatIst(row.valid_from)} (IST).`;
    default:
      return `${row.code} is activated, but it's ${statusLabel(row.status).toLowerCase()}, so customers still can't apply it.`;
  }
}

// --- IST datetimes -------------------------------------------------------------------

const IST_OFFSET_MS = 330 * 60_000;
const LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** A timestamp as a datetime-local input shows it, in IST: "2026-11-09T14:30". */
export function isoToIstLocal(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  return new Date(time + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** A datetime-local value read as IST, sent with its offset. Null when it isn't one. */
export function istLocalToIso(local: string): string | null {
  if (!LOCAL_PATTERN.test(local)) return null;
  const iso = `${local.slice(0, 16)}:00+05:30`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

// --- The form ------------------------------------------------------------------------

/** Every input as typed. The checks below turn it into a body. */
export interface CouponForm {
  code: string;
  discount_type: DiscountType;
  discount_value: string;
  max_discount: string;
  min_order_amount: string;
  valid_from: string;
  valid_until: string;
  usage_limit: string;
  usage_limit_per_user: string;
  is_active: boolean;
}

export type CouponField = Exclude<keyof CouponForm, "is_active">;

export const COUPON_FIELDS: CouponField[] = [
  "code",
  "discount_type",
  "discount_value",
  "max_discount",
  "min_order_amount",
  "valid_from",
  "valid_until",
  "usage_limit",
  "usage_limit_per_user",
];

export const CODE_PATTERN = /^[A-Z0-9]{3,20}$/;
const CODE_MAX = 20;
/** /operator/coupons/new is the create page, so a coupon called NEW couldn't be opened. */
export const RESERVED_CODES = ["NEW"];

/** The code input as typed: uppercased, anything outside A–Z0–9 dropped, 20 at most. */
export function normaliseCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_MAX);
}

export function emptyCouponForm(): CouponForm {
  return {
    code: "",
    discount_type: "percent",
    discount_value: "",
    max_discount: "",
    min_order_amount: "",
    valid_from: "",
    valid_until: "",
    usage_limit: "",
    usage_limit_per_user: "1",
    is_active: true,
  };
}

const moneyText = (value: number | null) => (value === null ? "" : trimNumber(value));

/** The edit form as it starts: the stored coupon. */
export function formFromRow(row: CouponRow): CouponForm {
  return {
    code: row.code,
    discount_type: row.discount_type,
    discount_value: trimNumber(row.discount_value),
    max_discount: moneyText(row.max_discount),
    min_order_amount: moneyText(row.min_order_amount),
    valid_from: isoToIstLocal(row.valid_from),
    valid_until: isoToIstLocal(row.valid_until),
    usage_limit: row.usage_limit === null ? "" : String(row.usage_limit),
    usage_limit_per_user: String(row.usage_limit_per_user),
    is_active: row.is_active,
  };
}

// Mirrors the backend's _MONEY_LIMIT (numeric(12, 2)) and _INT_MAX.
const MONEY_LIMIT = 10_000_000_000;
const INT_MAX = 2_147_483_647;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** A rupee amount: a stray ₹, comma or space is fine. Empty is null. */
function parseMoney(text: string): Parsed<number | null> {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (cleaned === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return { ok: false, error: "Enter a number." };
  if (/\.\d{3,}$/.test(cleaned)) return { ok: false, error: "At most 2 decimal places." };
  const value = Number(cleaned);
  if (value >= MONEY_LIMIT) return { ok: false, error: "That's too large." };
  return { ok: true, value };
}

/** A whole number. Empty is null. */
function parseWhole(text: string): Parsed<number | null> {
  const cleaned = text.replace(/[,\s]/g, "");
  if (cleaned === "") return { ok: true, value: null };
  if (!/^\d+$/.test(cleaned)) return { ok: false, error: "A whole number." };
  const value = Number(cleaned);
  return value > INT_MAX ? { ok: false, error: "That's too large." } : { ok: true, value };
}

/** The form, checked: every value as the backend takes it. */
export interface CouponValues {
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  /** Always null on a flat coupon, whatever the hidden input still holds. */
  max_discount: number | null;
  min_order_amount: number | null;
  /** Null on create: the server's own now. */
  valid_from: string | null;
  valid_until: string;
  usage_limit: number | null;
  usage_limit_per_user: number;
  is_active: boolean;
}

export type CouponErrors = Partial<Record<CouponField, string>>;

export type CouponCheck = { ok: true; values: CouponValues } | { ok: false; errors: CouponErrors };

export interface CheckOptions {
  mode: "create" | "edit";
  now: Date;
  /** Edit only: the stored coupon, for the usage-limit floor. */
  row?: CouponRow;
}

/**
 * The backend's rules, in its words where it has them, plus NEW being reserved.
 * On edit the code isn't checked (it isn't editable, and old ones may not match).
 */
export function validateCouponForm(form: CouponForm, options: CheckOptions): CouponCheck {
  const errors: CouponErrors = {};
  const creating = options.mode === "create";

  const code = creating ? form.code.trim().toUpperCase() : form.code;
  if (creating) {
    if (!CODE_PATTERN.test(code)) errors.code = "3 to 20 letters or digits.";
    else if (RESERVED_CODES.includes(code))
      errors.code = `${code} is reserved: it's the address of the create page.`;
  }

  const percent = form.discount_type === "percent";
  let discountValue = 0;
  const value = parseMoney(form.discount_value);
  if (!value.ok) errors.discount_value = value.error;
  else if (value.value === null) errors.discount_value = "Enter the discount.";
  else if (value.value <= 0) errors.discount_value = "More than 0.";
  else if (percent && value.value > 100)
    errors.discount_value = "A percent discount can be at most 100.";
  else discountValue = value.value;

  let maxDiscount: number | null = null;
  if (percent) {
    const max = parseMoney(form.max_discount);
    if (!max.ok) errors.max_discount = max.error;
    else if (max.value !== null && max.value <= 0)
      errors.max_discount = "More than ₹0, or leave it empty for no cap.";
    else maxDiscount = max.value;
  }

  const min = parseMoney(form.min_order_amount);
  if (!min.ok) errors.min_order_amount = min.error;
  const minOrder = min.ok ? min.value : null;

  let validFrom: string | null = null;
  if (form.valid_from === "") {
    if (!creating) errors.valid_from = "Pick a start date and time.";
  } else {
    validFrom = istLocalToIso(form.valid_from);
    if (validFrom === null) errors.valid_from = "Pick a full date and time.";
  }

  const validUntil = form.valid_until === "" ? null : istLocalToIso(form.valid_until);
  if (form.valid_until === "") errors.valid_until = "Pick an end date and time.";
  else if (validUntil === null) errors.valid_until = "Pick a full date and time.";
  else {
    const until = new Date(validUntil).getTime();
    if (validFrom !== null && until <= new Date(validFrom).getTime())
      errors.valid_until = "Must be after valid from.";
    else if (creating && until <= options.now.getTime())
      errors.valid_until = "Must be in the future.";
  }

  let usageLimit: number | null = null;
  const limit = parseWhole(form.usage_limit);
  if (!limit.ok) errors.usage_limit = limit.error;
  else if (limit.value !== null && limit.value < 1)
    errors.usage_limit = "1 or more, or leave it empty for unlimited.";
  else {
    usageLimit = limit.value;
    const row = options.row;
    if (
      row &&
      usageLimit !== null &&
      usageLimit !== row.usage_limit &&
      usageLimit < row.usage_count
    )
      errors.usage_limit = `Can't be below the ${row.usage_count} uses so far. Deactivate the coupon to stop it.`;
  }

  let perUser = 1;
  const perUserParsed = parseWhole(form.usage_limit_per_user);
  if (!perUserParsed.ok) errors.usage_limit_per_user = perUserParsed.error;
  else if (perUserParsed.value === null || perUserParsed.value < 1)
    errors.usage_limit_per_user = "1 or more.";
  else perUser = perUserParsed.value;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      code,
      discount_type: form.discount_type,
      discount_value: discountValue,
      max_discount: maxDiscount,
      min_order_amount: minOrder,
      valid_from: validFrom,
      valid_until: validUntil!,
      usage_limit: usageLimit,
      usage_limit_per_user: perUser,
      is_active: form.is_active,
    },
  };
}

/** The POST body. Empty optionals are left out, valid_from included: the server's now. */
export function createBody(values: CouponValues): CouponCreateBody {
  const body: CouponCreateBody = {
    code: values.code,
    discount_type: values.discount_type,
    discount_value: values.discount_value,
    valid_until: values.valid_until,
    usage_limit_per_user: values.usage_limit_per_user,
    is_active: values.is_active,
  };
  if (values.max_discount !== null) body.max_discount = values.max_discount;
  if (values.min_order_amount !== null) body.min_order_amount = values.min_order_amount;
  if (values.valid_from !== null) body.valid_from = values.valid_from;
  if (values.usage_limit !== null) body.usage_limit = values.usage_limit;
  return body;
}

/**
 * The PATCH: only what changed. Times compare at the input's minute precision,
 * so a stored valid_from with seconds never counts as a change. A switch to flat
 * sends max_discount: null only when a cap was stored.
 */
export function changedFields(row: CouponRow, values: CouponValues): CouponPatch {
  const patch: CouponPatch = {};
  if (values.discount_type !== row.discount_type) patch.discount_type = values.discount_type;
  if (values.discount_value !== row.discount_value) patch.discount_value = values.discount_value;
  if (values.max_discount !== row.max_discount) patch.max_discount = values.max_discount;
  if (values.min_order_amount !== row.min_order_amount)
    patch.min_order_amount = values.min_order_amount;
  if (
    values.valid_from !== null &&
    isoToIstLocal(values.valid_from) !== isoToIstLocal(row.valid_from)
  )
    patch.valid_from = values.valid_from;
  if (isoToIstLocal(values.valid_until) !== isoToIstLocal(row.valid_until))
    patch.valid_until = values.valid_until;
  if (values.usage_limit !== row.usage_limit) patch.usage_limit = values.usage_limit;
  if (values.usage_limit_per_user !== row.usage_limit_per_user)
    patch.usage_limit_per_user = values.usage_limit_per_user;
  return patch;
}

// --- Errors ----------------------------------------------------------------------

// The backend's messages name columns; these are the words the form uses.
const WORDS: [RegExp, string][] = [
  [/\busage_limit_per_user\b/g, "per-customer limit"],
  [/\busage_limit\b/g, "usage limit"],
  [/\bdiscount_value\b/g, "discount"],
  [/\bmax_discount\b/g, "max discount"],
  [/\bmin_order_amount\b/g, "min order"],
  [/\bvalid_from\b/g, "valid from"],
  [/\bvalid_until\b/g, "valid until"],
];

function humanizeMessage(message: string): string {
  const worded = WORDS.reduce((text, [pattern, word]) => text.replace(pattern, word), message);
  return worded.charAt(0).toUpperCase() + worded.slice(1);
}

/** What a failed write says. A 422's or 409's own message wins, so client and server can't drift. */
export function couponErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Your role can't change coupons.";
    if (err.status === 404) return "This coupon no longer exists. Reload the page.";
    if (err.status === 409 && err.message) return err.message;
    if (err.status === 422 && err.code === "COUPON_INVALID" && err.message)
      return humanizeMessage(err.message);
    if (err.status === 422)
      return "The server didn't accept a value. Check the form and try again.";
  }
  return "Couldn't save. Try again.";
}

/** The form field a refusal names, when it names one. "body" and the rest are form-level. */
export function couponErrorField(err: unknown): CouponField | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 409 && err.code === "COUPON_CODE_TAKEN") return "code";
  if (err.status !== 422) return null;
  const field = err.details?.field;
  return typeof field === "string" && (COUPON_FIELDS as string[]).includes(field)
    ? (field as CouponField)
    : null;
}
