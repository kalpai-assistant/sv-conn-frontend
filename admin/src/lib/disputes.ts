/**
 * Disputes and their refunds (SVC-431): the queue, a booking's dispute page, and
 * the log / pick up / resolve writes. The contract is the backend's
 * app/schemas/admin_disputes.py and app/services/admin_dispute_service.py
 * (BE #246). Money is rupees, as JSON numbers.
 *
 * The server computes what can be refunded (`refunds.refundable`) and is the
 * authority on every rule. The checks here only stop the mistakes it would
 * refuse anyway, before money is in play.
 */
import { ApiError, apiFetch } from "@/lib/api";
import type { AdminRole } from "@/lib/auth";
import { isCompleteDate, isUuid } from "@/lib/bookings";
import { formatRupees } from "@/lib/money";
import { parseMoney } from "@/lib/number-input";

// --- Types: app/schemas/admin_disputes.py -------------------------------------

export const REASON_CODES = ["NO_SHOW", "QUALITY", "BILLING", "BEHAVIOR", "OTHER"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const DISPUTE_STATUSES = ["RAISED", "IN_REVIEW", "RESOLVED", "CLOSED"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const RESOLUTION_TYPES = ["FULL_REFUND", "PARTIAL_REFUND", "NO_REFUND"] as const;
export type ResolutionType = (typeof RESOLUTION_TYPES)[number];

/** RAZORPAY: back onto the booking's payment. MANUAL: a cash booking, paid outside the app. */
export type RefundChannel = "RAZORPAY" | "MANUAL";
/** Razorpay refunds only; null on a manual one. */
export type RefundStatus = "PENDING" | "PROCESSED" | "FAILED";

/** The backend's TEXT_MAX, on description and notes. */
export const TEXT_MAX = 2000;

export interface DisputeRow {
  id: string;
  booking_id: string;
  /** The booking's own status, lowercase: "completed", "cancelled". */
  booking_status: string;
  payment_method: "cash" | "online" | null;
  reason_code: ReasonCode;
  description: string;
  status: DisputeStatus;
  resolution_type: ResolutionType | null;
  refund_amount: number | null;
  refund_channel: RefundChannel | null;
  refund_status: RefundStatus | null;
  refund_failed_reason: string | null;
  razorpay_refund_id: string | null;
  resolution_notes: string | null;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  created_by: string | null;
  created_by_name: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface DisputeListPage {
  items: DisputeRow[];
  total: number;
  page: number;
  per_page: number;
}

export interface DisputeParty {
  id: string;
  name: string | null;
}

export interface DisputeBooking {
  id: string;
  status: string;
  payment_method: "cash" | "online" | null;
  payment_status: string;
  settlement_status: string;
  service_amount: number;
  discount_amount: number;
  tip_amount: number;
  scheduled_at: string | null;
  created_at: string;
  cancellation_reason: string | null;
  customer: DisputeParty;
  customer_phone: string | null;
  /** The SP's user. */
  provider: DisputeParty | null;
  professional: DisputeParty | null;
}

/** What has been, and can still be, refunded. All computed by the server. */
export interface DisputeRefunds {
  /** Null: nothing was paid, so there is nothing to refund. */
  channel: RefundChannel | null;
  /** Service − discount; the tip is never refundable. */
  captured: number;
  cancel_refund: number;
  cancel_refund_id: string | null;
  cancel_refunded_at: string | null;
  /** Earlier dispute refunds; a failed Razorpay one isn't counted. */
  dispute_refunds: number;
  refundable: number;
  support_refund_limit: number;
}

export interface DisputeDetail {
  booking: DisputeBooking;
  refunds: DisputeRefunds;
  /** The RAISED or IN_REVIEW one, if any. */
  open_dispute: DisputeRow | null;
  /** Every dispute on the booking, the open one included, newest first. */
  disputes: DisputeRow[];
}

export interface DisputeCreateBody {
  booking_id: string;
  reason_code: ReasonCode;
  description: string;
}

/** extra="forbid": NO_REFUND must leave refund_amount out, not send null. */
export interface DisputeResolveBody {
  resolution_type: ResolutionType;
  refund_amount?: number;
  notes: string;
}

// --- Paths and calls ---------------------------------------------------------

export const DISPUTES_PATH = "/admin/disputes";
export const DISPUTES_PAGE_SIZE = 50;

export function disputeDetailPath(bookingId: string): string {
  return `${DISPUTES_PATH}/bookings/${encodeURIComponent(bookingId)}`;
}

export interface RefundsSearch {
  status?: DisputeStatus;
  reason?: ReasonCode;
  /** yyyy-mm-dd, an IST day, inclusive at both ends. */
  from?: string;
  to?: string;
  page?: number;
}

function pick<T extends string>(options: readonly T[], value: unknown): T | undefined {
  return (options as readonly unknown[]).includes(value) ? (value as T) : undefined;
}

/**
 * Anything unknown becomes undefined, explicitly: the router merges the raw URL
 * over what this returns, so leaving a bad key out would keep it.
 */
export function validateRefundsSearch(raw: Record<string, unknown>): RefundsSearch {
  const day = (value: unknown) =>
    typeof value === "string" && isCompleteDate(value) ? value : undefined;
  const page = raw.page;
  return {
    status: pick(DISPUTE_STATUSES, raw.status),
    reason: pick(REASON_CODES, raw.reason),
    from: day(raw.from),
    to: day(raw.to),
    page: typeof page === "number" && Number.isSafeInteger(page) && page > 1 ? page : undefined,
  };
}

export function hasRefundFilters(search: RefundsSearch): boolean {
  return Boolean(search.status || search.reason || search.from || search.to);
}

const DAY_MS = 86_400_000;

/** The instant an IST day starts. IST has no DST, so a day is always 24 hours. */
export function istDayStart(day: string): string {
  return new Date(`${day}T00:00:00+05:30`).toISOString();
}

/** The instant after an IST day ends: the exclusive date_to, so the whole day counts. */
export function istDayEnd(day: string): string {
  return new Date(new Date(`${day}T00:00:00+05:30`).getTime() + DAY_MS).toISOString();
}

/**
 * The queue call. IST days, as formatIst shows times, sent as UTC instants: a
 * raw "+05:30" in a query string would arrive with the + read as a space.
 */
export function disputesListPath(search: RefundsSearch): string {
  const params = new URLSearchParams();
  if (search.status) params.set("status", search.status);
  if (search.reason) params.set("reason_code", search.reason);
  if (search.from && isCompleteDate(search.from)) params.set("date_from", istDayStart(search.from));
  if (search.to && isCompleteDate(search.to)) params.set("date_to", istDayEnd(search.to));
  params.set("page", String(search.page ?? 1));
  params.set("per_page", String(DISPUTES_PAGE_SIZE));
  return `${DISPUTES_PATH}?${params}`;
}

export function createDispute(body: DisputeCreateBody): Promise<DisputeRow> {
  return apiFetch<DisputeRow>(DISPUTES_PATH, { method: "POST", body: JSON.stringify(body) });
}

export function reviewDispute(id: string): Promise<DisputeRow> {
  return apiFetch<DisputeRow>(`${DISPUTES_PATH}/${encodeURIComponent(id)}/review`, {
    method: "POST",
  });
}

export function resolveDispute(id: string, body: DisputeResolveBody): Promise<DisputeRow> {
  return apiFetch<DisputeRow>(`${DISPUTES_PATH}/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Labels ------------------------------------------------------------------------

const REASON_LABELS: Record<ReasonCode, string> = {
  NO_SHOW: "No-show",
  QUALITY: "Quality",
  BILLING: "Billing",
  BEHAVIOR: "Behaviour",
  OTHER: "Other",
};

const STATUS_LABELS: Record<DisputeStatus, string> = {
  RAISED: "Raised",
  IN_REVIEW: "In review",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const RESOLUTION_LABELS: Record<ResolutionType, string> = {
  FULL_REFUND: "Full refund",
  PARTIAL_REFUND: "Partial refund",
  NO_REFUND: "No refund",
};

const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  PENDING: "Refund pending",
  PROCESSED: "Refunded",
  FAILED: "Refund failed",
};

export function reasonLabel(code: string): string {
  return REASON_LABELS[code as ReasonCode] ?? code;
}

export function disputeStatusLabel(status: string): string {
  return STATUS_LABELS[status as DisputeStatus] ?? status;
}

export function resolutionLabel(type: string): string {
  return RESOLUTION_LABELS[type as ResolutionType] ?? type;
}

export function refundStatusLabel(status: string): string {
  return REFUND_STATUS_LABELS[status as RefundStatus] ?? status;
}

export const STATUS_OPTIONS = DISPUTE_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

export const REASON_OPTIONS = REASON_CODES.map((value) => ({ value, label: REASON_LABELS[value] }));

export const RESOLUTION_OPTIONS = RESOLUTION_TYPES.map((value) => ({
  value,
  label: RESOLUTION_LABELS[value],
}));

/** How a refund on this booking is paid, in the words the resolve form uses. */
export function channelLabel(channel: RefundChannel | null): string {
  if (channel === "MANUAL") return "Manual refund: record only, pay the customer outside the app";
  if (channel === "RAZORPAY") return "Razorpay: back to the customer's original payment";
  return "Nothing was paid, so there is nothing to refund";
}

/** The queue's short form: "₹200 · Razorpay", "₹150 · Manual". */
export function refundSummary(row: Pick<DisputeRow, "refund_amount" | "refund_channel">): string {
  if (row.refund_amount === null) return "—";
  const via = row.refund_channel === "MANUAL" ? "Manual" : "Razorpay";
  return `${formatRupees(row.refund_amount)} · ${via}`;
}

export function customerLabel(row: Pick<DisputeRow, "customer_name" | "customer_phone">): string {
  return row.customer_name?.trim() || row.customer_phone || "Unnamed customer";
}

export function isOpen(status: string): boolean {
  return status === "RAISED" || status === "IN_REVIEW";
}

/** The backend's DISPUTABLE_BOOKING_STATUSES. */
export function canLogDispute(bookingStatus: string): boolean {
  return bookingStatus === "completed" || bookingStatus === "cancelled";
}

// --- Roles -----------------------------------------------------------------------

/** Support is capped at refunds.support_refund_limit per dispute; admin and ops aren't. */
export function isCapped(role: AdminRole): boolean {
  return role === "support";
}

// --- Money: whole paise, so 499.5 vs 499.50 never compares wrong -----------------

const toPaise = (rupees: number) => Math.round(rupees * 100);

// --- The log form ----------------------------------------------------------------------

export interface LogForm {
  reason_code: ReasonCode | "";
  description: string;
}

export type LogErrors = Partial<Record<keyof LogForm, string>>;

function checkText(raw: string, what: string): { text: string } | { error: string } {
  const text = raw.trim();
  if (!text) return { error: `Enter the ${what}.` };
  if (text.length > TEXT_MAX) return { error: `At most ${TEXT_MAX} characters.` };
  return { text };
}

export function checkLogForm(
  form: LogForm,
  bookingId: string,
): { ok: true; body: DisputeCreateBody } | { ok: false; errors: LogErrors } {
  const errors: LogErrors = {};
  if (!form.reason_code) errors.reason_code = "Pick a reason.";
  const description = checkText(form.description, "customer's complaint");
  if ("error" in description) errors.description = description.error;
  if (Object.keys(errors).length > 0 || !form.reason_code || "error" in description) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    body: { booking_id: bookingId, reason_code: form.reason_code, description: description.text },
  };
}

// --- The resolve form ------------------------------------------------------------------

export interface ResolveForm {
  resolution_type: ResolutionType;
  /** The partial amount as typed. Starts empty, never the refundable amount. */
  amount: string;
  notes: string;
}

export type ResolveErrors = Partial<Record<"resolution_type" | "amount" | "notes", string>>;

export interface ResolveContext {
  refunds: Pick<DisputeRefunds, "channel" | "refundable" | "support_refund_limit">;
  role: AdminRole;
}

export function emptyResolveForm(): ResolveForm {
  return { resolution_type: "FULL_REFUND", amount: "", notes: "" };
}

/** Whether a refund (full or partial) is possible at all. Otherwise only NO_REFUND. */
export function canRefund(refunds: Pick<DisputeRefunds, "channel" | "refundable">): boolean {
  return refunds.channel !== null && toPaise(refunds.refundable) > 0;
}

export type ResolveCheck =
  { ok: true; body: DisputeResolveBody } | { ok: false; errors: ResolveErrors };

/**
 * The resolve body, or what's wrong with the form. FULL sends the refundable
 * amount the page loaded, so a stale page is refused (422 with details.refundable)
 * rather than refunding a different amount than the one confirmed.
 */
export function checkResolveForm(
  form: ResolveForm,
  { refunds, role }: ResolveContext,
): ResolveCheck {
  const errors: ResolveErrors = {};
  const notes = checkText(form.notes, "notes");
  if ("error" in notes) errors.notes = notes.error;

  let amount: number | undefined;
  if (form.resolution_type !== "NO_REFUND") {
    if (!canRefund(refunds)) {
      errors.resolution_type =
        "Nothing is left to refund on this booking. Resolve it as No refund.";
    } else if (form.resolution_type === "FULL_REFUND") {
      amount = refunds.refundable;
    } else {
      const parsed = parseMoney(form.amount);
      if (!parsed.ok) errors.amount = parsed.error;
      else if (parsed.value === null) errors.amount = "Enter the amount to refund.";
      else if (toPaise(parsed.value) <= 0) errors.amount = "More than ₹0.";
      else if (toPaise(parsed.value) > toPaise(refunds.refundable))
        errors.amount = `Only ${formatRupees(refunds.refundable)} is left to refund.`;
      else amount = parsed.value;
    }
    if (
      amount !== undefined &&
      isCapped(role) &&
      toPaise(amount) > toPaise(refunds.support_refund_limit)
    ) {
      errors.amount = `Support can refund up to ${formatRupees(refunds.support_refund_limit)} per dispute. Ask an admin or ops to make this refund.`;
      amount = undefined;
    }
  }

  if (Object.keys(errors).length > 0 || "error" in notes) return { ok: false, errors };
  const body: DisputeResolveBody = { resolution_type: form.resolution_type, notes: notes.text };
  if (amount !== undefined) body.refund_amount = amount;
  return { ok: true, body };
}

/** The confirm dialog's words: the amount, the channel, and that it's final. */
export function confirmCopy(
  body: DisputeResolveBody,
  channel: RefundChannel | null,
  customer: string,
): { title: string; detail: string; action: string } {
  if (body.refund_amount === undefined) {
    return {
      title: "Close with no refund?",
      detail: `The dispute closes and no money goes back to ${customer}. They get a push saying so. This can't be undone.`,
      action: "Close with no refund",
    };
  }
  const amount = formatRupees(body.refund_amount);
  if (channel === "MANUAL") {
    return {
      title: `Record a ${amount} manual refund?`,
      detail: `This is a cash booking, so the app moves no money: pay ${customer} ${amount} yourself (UPI, say) if you haven't, and say how in the notes. The dispute closes and this can't be undone.`,
      action: `Record ${amount} refund`,
    };
  }
  return {
    title: `Refund ${amount} through Razorpay?`,
    detail: `${amount} goes back to ${customer}'s original payment. Razorpay sends it at once and it can't be undone.`,
    action: `Refund ${amount}`,
  };
}

/** What the page says after a resolve, from the row the server returned. */
export function resolvedNotice(row: DisputeRow): { kind: "success" | "error"; text: string } {
  if (row.refund_amount === null) return { kind: "success", text: "Closed with no refund." };
  const amount = formatRupees(row.refund_amount);
  if (row.refund_channel === "MANUAL")
    return { kind: "success", text: `Manual refund of ${amount} recorded. The dispute is closed.` };
  if (row.refund_status === "PROCESSED")
    return { kind: "success", text: `${amount} refunded through Razorpay. The dispute is closed.` };
  if (row.refund_status === "FAILED")
    return {
      kind: "error",
      text: `Razorpay reported the ${amount} refund failed. ${row.refund_failed_reason ?? ""}`.trim(),
    };
  return {
    kind: "success",
    text: `${amount} refund sent to Razorpay. It shows as pending until Razorpay confirms it, then the dispute closes.`,
  };
}

// --- Errors ----------------------------------------------------------------------

export const GATEWAY_ERROR_MESSAGE =
  "Razorpay didn't answer, so the refund may or may not have gone through. Check the Razorpay dashboard for this booking before you retry. Retrying is safe: a refund already made is reused, not made twice.";

const UNKNOWN_OUTCOME =
  "Couldn't confirm whether that went through. Reload the page to see where the dispute stands before you try again.";

/** A booking id the backend can't find, or one that isn't an id at all (FastAPI's 422). */
export function isBookingNotFound(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    ((err.status === 404 && err.code !== "DISPUTE_NOT_FOUND") ||
      (err.status === 422 && err.code === undefined))
  );
}

export function isValidBookingId(id: string): boolean {
  return isUuid(id);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Every refusal of a dispute write, in plain words. */
export function disputeErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return UNKNOWN_OUTCOME;
  const details = err.details ?? {};
  switch (err.code) {
    case "DISPUTE_NOT_FOUND":
      return "This dispute no longer exists. Reload the page.";
    case "BOOKING_NOT_FOUND":
      return "No booking with this ID.";
    case "DISPUTE_ALREADY_OPEN":
      return "This booking already has an open dispute. The page now shows it.";
    case "DISPUTE_BOOKING_NOT_FINISHED":
      return "A dispute can only be logged once the booking is completed or cancelled.";
    case "DISPUTE_INVALID_STATE":
      return "Someone has already moved this dispute on. The page now shows where it stands.";
    case "NOTHING_TO_REFUND":
      return "Nothing is left to refund on this booking. Resolve it as No refund.";
    case "DISPUTE_INVALID": {
      const refundable = num(details.refundable);
      if (refundable !== null)
        return `The refundable amount is now ${formatRupees(refundable)}. The page has been reloaded: check the amount and try again.`;
      return err.message
        ? `The server didn't accept the form: ${err.message}.`
        : "The server didn't accept the form. Check it and try again.";
    }
    case "REFUND_REJECTED": {
      const reason =
        typeof details.razorpay_error === "string" && details.razorpay_error
          ? details.razorpay_error
          : err.message;
      return `Razorpay refused the refund: ${reason}. No money moved and the dispute is unchanged.`;
    }
    case "REFUND_OVER_SUPPORT_LIMIT": {
      const limit = num(details.limit);
      return `Support can refund up to ${limit === null ? "the support limit" : formatRupees(limit)} per dispute. Ask an admin or ops to make this refund.`;
    }
    case "REFUND_GATEWAY_ERROR":
      return GATEWAY_ERROR_MESSAGE;
  }
  if (err.status === 403) return "Your role can't do this.";
  if (err.status === 404) return "Not found. Reload the page.";
  if (err.status === 409)
    return err.message || "This changed while you were looking. Reload the page.";
  if (err.status === 422) return "The server didn't accept a value. Check the form and try again.";
  // A 5xx without REFUND_GATEWAY_ERROR (a proxy, say) isn't known to be Razorpay.
  if (err.status >= 500) return UNKNOWN_OUTCOME;
  return err.message || "Something went wrong. Try again.";
}
