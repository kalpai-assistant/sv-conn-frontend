/**
 * The bookings screen (SVC-425). The contract is GET /admin/bookings, GET
 * /admin/bookings/{id}, GET /admin/bookings/{id}/timeline and POST
 * /admin/bookings/{id}/cancel in the backend's app/routers/admin.py. The totals and
 * refund copy are ported from the consumer app's src/routes/admin.bookings.tsx,
 * which SVC-434 removes.
 */
import type { AdminRole } from "@/lib/auth";

export const BOOKINGS_PAGE_SIZE = 25;
/** The most a force-cancel reason may be. The backend refuses anything longer. */
export const CANCEL_REASON_MAX = 500;

export const BOOKING_STATUSES = [
  "requested",
  "accepted",
  "en_route",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  requested: "Requested",
  accepted: "Accepted",
  en_route: "En route",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

export interface BookingItem {
  id: string;
  service_id: string;
  service_name: string;
  variant_label: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface BookingAddress {
  id: string;
  label: string;
  full_address: string;
  lat: number | null;
  lng: number | null;
}

export interface BookingProfessional {
  id: string;
  display_name: string;
  is_self: boolean;
}

export interface BookingServiceProvider {
  user_id: string;
  business_name: string | null;
}

/** One booking, as the list and the detail both send it. */
export interface Booking {
  id: string;
  consumer_id: string;
  provider_id: string | null;
  items: BookingItem[];
  /** A string, not BookingStatus: a status added later must still render. */
  status: string;
  service_amount: number;
  platform_commission: number;
  provider_payout: number;
  discount_amount: number;
  tip_amount: number;
  payment_method: string | null;
  payment_status: string;
  /** Null on every list row (SVC-170). Only the detail sends it. */
  address: BookingAddress | null;
  is_disputed: boolean;
  consumer_phone: string | null;
  provider_name: string | null;
  professional: BookingProfessional | null;
  service_provider: BookingServiceProvider | null;
  scheduled_at: string | null;
  created_at: string;
  // Detail only, and optional: the backend follow-up to SVC-425 adds them to
  // GET /admin/bookings/{id} and the cancel response. Shown only when set.
  cancellation_reason?: string | null;
  settlement_status?: string | null;
  settled_at?: string | null;
}

export interface BookingListPage {
  bookings: Booking[];
  total: number;
  page: number;
  per_page: number;
}

export interface TimelinePro {
  id: string;
  display_name: string;
}

export interface StatusTimelineItem {
  type: "status";
  created_at: string;
  from_status: string;
  to_status: string;
  actor_user_id: string | null;
  actor_name: string | null;
  note: string | null;
}

export interface AssignmentTimelineItem {
  type: "assignment";
  created_at: string;
  kind: string;
  from_professional: TimelinePro | null;
  to_professional: TimelinePro | null;
  actor_user_id: string | null;
  actor_name: string | null;
  note: string | null;
}

export type TimelineItem = StatusTimelineItem | AssignmentTimelineItem;

/** What the URL holds. Every field is optional, so a bare /operator/bookings is the default view. */
export interface BookingsSearch {
  status?: BookingStatus;
  disputed?: true;
  /** yyyy-mm-dd, an IST day, inclusive. */
  from?: string;
  to?: string;
  phone?: string;
  sp?: string;
  page?: number;
  /** The open booking's full id. */
  booking?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

// A date input reports a value on every keystroke, so typing 2026 passes through
// the years 0002, 0020 and 0202. Only a whole date is a filter.
export function isCompleteDate(value: string): boolean {
  return /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value);
}

// The router JSON-parses each search value, so a phone typed as digits comes back
// a number. Text filters accept either and keep what was typed.
function text(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

/**
 * Anything unknown becomes undefined, explicitly: the router merges the raw URL
 * over what this returns, so leaving a bad key out would keep it.
 */
export function validateBookingsSearch(raw: Record<string, unknown>): BookingsSearch {
  const status = BOOKING_STATUSES.find((known) => known === raw.status);
  const from = typeof raw.from === "string" && isCompleteDate(raw.from) ? raw.from : undefined;
  const to = typeof raw.to === "string" && isCompleteDate(raw.to) ? raw.to : undefined;
  const booking = typeof raw.booking === "string" && isUuid(raw.booking) ? raw.booking : undefined;
  const page = raw.page;
  return {
    status,
    disputed: raw.disputed === true || raw.disputed === "true" ? true : undefined,
    from,
    to,
    phone: text(raw.phone),
    sp: text(raw.sp),
    page: typeof page === "number" && Number.isSafeInteger(page) && page > 1 ? page : undefined,
    booking,
  };
}

/** The list call for these filters. Phone and SP name go as typed: the backend reads them. */
export function bookingsListPath(search: BookingsSearch): string {
  const params = new URLSearchParams();
  if (search.status) params.set("status", search.status);
  if (search.disputed) params.set("disputed", "true");
  if (search.from) params.set("created_from", search.from);
  if (search.to) params.set("created_to", search.to);
  if (search.phone) params.set("consumer_phone", search.phone);
  if (search.sp) params.set("provider_name", search.sp);
  params.set("page", String(search.page ?? 1));
  params.set("per_page", String(BOOKINGS_PAGE_SIZE));
  return `/admin/bookings?${params}`;
}

export function bookingPath(id: string): string {
  return `/admin/bookings/${encodeURIComponent(id)}`;
}

export function hasFilters(search: BookingsSearch): boolean {
  return Boolean(
    search.status || search.disputed || search.from || search.to || search.phone || search.sp,
  );
}

export function lastPage(total: number, perPage = BOOKINGS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** The first block of the id. Enough to tell rows apart; the detail shows the whole id. */
export function shortId(id: string): string {
  return id.split("-")[0];
}

export function statusLabel(status: string): string {
  return BOOKING_STATUS_LABELS[status as BookingStatus] ?? humanize(status);
}

/** "refund_processing" → "Refund processing". For values with no label of their own. */
export function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : value;
}

/** "Deep Clean", or "Deep Clean + 2 more", as legacy and the backend summarise a cart. */
export function itemsSummary(items: BookingItem[]): string {
  if (items.length === 0) {
    return "No items";
  }
  const first = items[0].service_name;
  return items.length === 1 ? first : `${first} + ${items.length - 1} more`;
}

/** What the customer was charged: service amount, less the discount, plus the tip. */
export function totalCharged(
  booking: Pick<Booking, "service_amount" | "discount_amount" | "tip_amount">,
): number {
  return Math.max(0, booking.service_amount - booking.discount_amount + booking.tip_amount);
}

const RUPEES = {
  whole: new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }),
  paise: new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

/** Indian-grouped rupees. Paise show only when there are some: ₹1,499 but ₹1,499.50. */
export function formatRupees(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return (Number.isInteger(rounded) ? RUPEES.whole : RUPEES.paise).format(rounded);
}

const IST_DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * A timestamp in IST, the zone the date filters use, so a booking's shown date and
 * the day it filters under always agree. An unreadable one is shown as it came.
 */
export function formatIst(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : IST_DATE_TIME.format(date);
}

/** A timeline actor. Null is the system: a no-taker expiry, say. */
export function actorLabel(name: string | null, userId: string | null): string {
  if (name) return name;
  return userId ? "Unnamed user" : "System";
}

const ASSIGNMENT_KIND_LABELS: Record<string, string> = {
  claimed: "Pro assigned",
  repicked: "Pro changed",
  declined: "Pro declined",
  released: "Pro released",
  provider_cancelled: "Provider cancelled",
};

/** One line for a timeline entry: what happened, in words. */
export function timelineTitle(item: TimelineItem): string {
  if (item.type === "status") {
    return `${statusLabel(item.from_status)} → ${statusLabel(item.to_status)}`;
  }
  return ASSIGNMENT_KIND_LABELS[item.kind] ?? humanize(item.kind);
}

/** For an assignment: who it moved from and to. Null for a status change. */
export function timelineProChange(item: TimelineItem): string | null {
  if (item.type !== "assignment") {
    return null;
  }
  const from = item.from_professional?.display_name ?? "nobody";
  const to = item.to_professional?.display_name ?? "nobody";
  return `${from} → ${to}`;
}

/** Ops can cancel, support only looks (the backend answers support with a 403). */
export function canForceCancel(role: AdminRole): boolean {
  return role === "admin" || role === "ops";
}

const FINAL_STATUSES = new Set(["completed", "cancelled", "expired"]);

/** The backend refuses these with a 409. */
export function isCancellable(status: string): boolean {
  return !FINAL_STATUSES.has(status);
}

export type ReasonCheck = { ok: true; reason: string } | { ok: false; message: string };

export function checkCancelReason(raw: string): ReasonCheck {
  const reason = raw.trim();
  if (!reason) {
    return { ok: false, message: "Enter a reason." };
  }
  if (reason.length > CANCEL_REASON_MAX) {
    return { ok: false, message: `Keep the reason to ${CANCEL_REASON_MAX} characters.` };
  }
  return { ok: true, reason };
}

/**
 * What a force cancel does with the money. Mirrors the backend's
 * BookingService._apply_cancellation_policy, which force_cancel reuses.
 */
export function refundCopy(
  booking: Pick<
    Booking,
    "status" | "payment_method" | "payment_status" | "service_amount" | "discount_amount"
  >,
): string {
  if (booking.status === "in_progress") {
    return "This job has started, so there is no automatic refund. Refund the customer yourself if needed.";
  }
  if (booking.payment_method !== "online") {
    return "Cash booking: no money moves.";
  }
  if (booking.payment_status !== "paid") {
    return "No payment was captured, so there is nothing to refund.";
  }
  const captured = formatRupees(Math.max(0, booking.service_amount - booking.discount_amount));
  if (booking.status === "requested") {
    return `The customer gets a full refund of ${captured}.`;
  }
  return `The customer gets ${captured} back, less the cancellation fee, which goes to the provider.`;
}
