/**
 * The support console (SVC-433). The contract is the backend's
 * app/routers/admin_support.py (lookup, customer profile, notes, contacted,
 * retry dispatch, eligible Pros and reassign). Every route is open to admin, ops
 * and support, so nothing here branches on role.
 */
import { ApiError } from "@/lib/api";
import { bookingPath, isUuid } from "@/lib/bookings";

/** The backend refuses a lookup outside these (422). */
export const LOOKUP_MIN = 3;
export const LOOKUP_MAX = 100;
/** The most a note (or a contacted note) may be. */
export const NOTE_MAX = 2000;

export type LookupKind = "phone" | "booking_id" | "booking_id_suffix" | "name";
export type ResultKind = "customers" | "providers" | "pros" | "bookings";

export interface LookupCustomer {
  user_id: string;
  name: string | null;
  phone: string;
  created_at: string;
  is_active: boolean;
  deleted: boolean;
  booking_count: number;
}

export interface LookupProvider {
  user_id: string;
  name: string | null;
  business_name: string | null;
  phone: string;
  kyc_status: string;
  is_online: boolean;
  matched_by: string;
}

export interface LookupPro {
  professional_id: string;
  display_name: string;
  phone: string;
  is_online: boolean;
  is_active: boolean;
  service_provider: { user_id: string; name: string | null; business_name: string | null };
}

export interface LookupBooking {
  id: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  service_summary: string;
  consumer_name: string | null;
  consumer_phone: string | null;
  provider_name: string | null;
  matched_by: string;
}

export interface LookupResponse {
  query: string;
  /** Strings, not LookupKind: a kind added later must still render. */
  interpreted_as: string[];
  customers: LookupCustomer[];
  providers: LookupProvider[];
  pros: LookupPro[];
  bookings: LookupBooking[];
  truncated: string[];
}

export interface CustomerBooking {
  id: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  service_summary: string;
  total: number;
  payment_method: string | null;
  provider: { user_id: string; name: string | null; business_name: string | null } | null;
  professional: { id: string; display_name: string } | null;
}

export interface CustomerProfile {
  user_id: string;
  name: string | null;
  phone: string;
  email: string | null;
  created_at: string;
  deleted_at: string | null;
  is_active: boolean;
  address_count: number;
  lifetime_bookings: number;
  completed_bookings: number;
  lifetime_spend: number;
  recent_bookings: CustomerBooking[];
}

export interface SupportNoteAuthor {
  user_id: string;
  name: string | null;
  email: string | null;
  admin_role: string | null;
}

export interface SupportNote {
  id: string;
  booking_id: string;
  /** "note" or "contacted". */
  kind: string;
  body: string | null;
  created_at: string;
  author: SupportNoteAuthor;
}

export interface RetryDispatchResponse {
  booking_id: string;
  status: string;
  recipients: number;
  retried_at: string;
  offer_expires_at: string;
}

export interface EligiblePro {
  professional_id: string;
  display_name: string;
  phone: string;
  is_self: boolean;
  is_online: boolean;
  kyc_status: string;
  is_current: boolean;
  eligible: boolean;
  refusal_code: string | null;
}

export interface EligibleProsResponse {
  booking_id: string;
  service_provider_id: string;
  current_professional_id: string | null;
  pros: EligiblePro[];
}

/** What the URL holds: the query, and whichever customer or booking is open. */
export interface SupportSearch {
  q?: string;
  customer?: string;
  booking?: string;
}

/**
 * Anything unknown becomes undefined, explicitly: the router merges the raw URL
 * over what this returns. The router JSON-parses values, so a phone typed as
 * digits arrives as a number; it's kept as typed.
 */
export function validateSupportSearch(raw: Record<string, unknown>): SupportSearch {
  const q =
    typeof raw.q === "number" && Number.isFinite(raw.q)
      ? String(raw.q)
      : typeof raw.q === "string" && raw.q.trim()
        ? raw.q.trim().slice(0, LOOKUP_MAX)
        : undefined;
  const uuid = (value: unknown) =>
    typeof value === "string" && isUuid(value) ? value.toLowerCase() : undefined;
  return { q, customer: uuid(raw.customer), booking: uuid(raw.booking) };
}

export type QueryCheck = { ok: true; query: string } | { ok: false; message: string };

export function checkLookupQuery(raw: string): QueryCheck {
  const query = raw.trim();
  if (query.length < LOOKUP_MIN) {
    return {
      ok: false,
      message: `Type at least ${LOOKUP_MIN} characters: a phone number, a booking ID or its last 6 characters, or a name.`,
    };
  }
  if (query.length > LOOKUP_MAX) {
    return { ok: false, message: `Keep it to ${LOOKUP_MAX} characters.` };
  }
  return { ok: true, query };
}

/** The lookup call, or null when the query can't be sent (the backend would 422). */
export function lookupPath(q: string | undefined): string | null {
  if (!q) return null;
  const check = checkLookupQuery(q);
  return check.ok ? `/admin/support/lookup?${new URLSearchParams({ q: check.query })}` : null;
}

export function customerPath(id: string): string {
  return `/admin/support/customers/${encodeURIComponent(id)}`;
}

export function notesPath(bookingId: string): string {
  return `${bookingPath(bookingId)}/notes`;
}

const KIND_LABELS: Record<string, string> = {
  phone: "phone number",
  booking_id: "booking ID",
  booking_id_suffix: "end of a booking ID",
  name: "name",
};

/** "phone number", "booking ID": how the backend read the query. */
export function interpretedLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

const RESULT_LABELS: Record<string, string> = {
  customers: "customers",
  providers: "service providers",
  pros: "Pros",
  bookings: "bookings",
};

export function resultKindLabel(kind: string): string {
  return RESULT_LABELS[kind] ?? kind;
}

export function lookupTotal(result: LookupResponse): number {
  return (
    result.customers.length + result.providers.length + result.pros.length + result.bookings.length
  );
}

/**
 * A full booking ID that found exactly that booking, and nothing else: the
 * ticket says to jump straight to it. Anything less specific shows the list.
 */
export function directBookingHit(result: LookupResponse): string | null {
  if (!result.interpreted_as.includes("booking_id")) return null;
  if (result.bookings.length !== 1 || lookupTotal(result) !== 1) return null;
  return result.bookings[0].id;
}

/** The note's author as a person reads them: name, then email. */
export function noteAuthorLabel(author: SupportNoteAuthor): string {
  return author.name?.trim() || author.email?.trim() || "Unnamed admin";
}

const ROLE_LABELS: Record<string, string> = { admin: "Admin", ops: "Ops", support: "Support" };

export function adminRoleLabel(role: string | null): string | null {
  if (!role) return null;
  return ROLE_LABELS[role] ?? role;
}

const IST_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
});

/** "3:42 pm": a time in IST. An unreadable one is shown as it came. */
export function formatIstTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : IST_TIME.format(date);
}

/**
 * The retry's result. "Sent", not "offered": the count is taken before the
 * broadcast runs, so it's who it went to, not who saw it.
 */
export function retrySuccessText(result: RetryDispatchResponse): string {
  const who = result.recipients === 1 ? "1 provider" : `${result.recipients} providers`;
  return `Sent to ${who}. The new offer expires at ${formatIstTime(result.offer_expires_at)} IST.`;
}

/**
 * NO_ELIGIBLE_PROVIDERS' details.reason: funnel_reason() in the backend's
 * app/services/provider_matching.py (the first stage that left nobody), plus
 * the two the retry route checks before it.
 */
const NO_PROVIDER_REASONS: Record<string, string> = {
  no_provider_covers_services: "no provider offers everything in this booking.",
  none_kyc_verified: "no provider who offers it has finished KYC.",
  none_account_active: "every provider who offers it has an inactive account.",
  none_has_push_token: "no provider who offers it can get notifications.",
  none_online: "no provider who offers it is online.",
  none_in_service_area: "no online provider covers this address.",
  none_has_someone_to_do_it: "no nearby provider has a Pro free to do it.",
  all_already_answered: "every eligible provider has already declined or answered it.",
  unknown: "someone just became available. Try again.",
  "no-address-location": "the booking's address has no map location.",
  "empty-cart": "the booking has no services in it.",
};

function detailString(error: ApiError, key: string): string | undefined {
  const value = error.details?.[key];
  return typeof value === "string" ? value : undefined;
}

/** A failed retry, in words. Anything unrecognised shows what the backend said. */
export function retryErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Couldn't retry dispatch. Please try again.";
  }
  switch (error.code) {
    case "BOOKING_NOT_REQUESTED":
      return "This booking isn't waiting for a provider any more, so there's nothing to retry.";
    case "DISPATCH_RETRY_TOO_SOON": {
      const seconds = Number(error.details?.retry_after_seconds);
      const wait =
        Number.isFinite(seconds) && seconds > 0
          ? `in ${Math.ceil(seconds)} ${Math.ceil(seconds) === 1 ? "second" : "seconds"}`
          : "in a minute";
      return `Dispatch was retried a moment ago. Try again ${wait}.`;
    }
    case "NO_ELIGIBLE_PROVIDERS": {
      const reason = detailString(error, "reason");
      const words = reason ? NO_PROVIDER_REASONS[reason] : undefined;
      return words ? `No provider can take this booking right now: ${words}` : error.message;
    }
  }
  if (error.status === 403) return "Your role can't retry dispatch.";
  if (error.status >= 500) return "Couldn't retry dispatch. Please try again.";
  return error.message;
}

/** Why a Pro can't take this booking: the 409 a reassign to them would get. */
const REFUSAL_LABELS: Record<string, string> = {
  PRO_DECLINED_THIS_BOOKING: "Declined this booking",
  SELF_NOT_TAKING_JOBS: "Owner isn't taking jobs",
  PRO_KYC_INCOMPLETE: "KYC not complete",
  PRO_OFFLINE: "Offline",
  PRO_BUSY: "On another job",
  BOOKING_NOT_REASSIGNABLE: "Booking can't change Pro",
  PRO_NOT_FOUND: "No longer on this team",
};

export function refusalLabel(code: string | null): string {
  if (!code) return "Not available";
  return REFUSAL_LABELS[code] ?? code.replace(/_/g, " ").toLowerCase();
}

/** A failed reassign, in words. */
export function reassignErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Couldn't reassign the Pro. Please try again.";
  }
  switch (error.code) {
    case "BOOKING_NOT_REASSIGNABLE":
      return "Only an accepted booking can change Pro.";
    case "PRO_NOT_FOUND":
      return "That Pro is no longer on this team.";
  }
  if (error.code && REFUSAL_LABELS[error.code]) {
    return `Can't assign this Pro: ${REFUSAL_LABELS[error.code].toLowerCase()}.`;
  }
  if (error.status === 403) return "Your role can't reassign Pros.";
  if (error.status >= 500) return "Couldn't reassign the Pro. Please try again.";
  return error.message;
}

/** A failed note or contacted mark, in words. */
export function noteErrorText(error: unknown, what: "note" | "contacted"): string {
  const fallback =
    what === "note"
      ? "Couldn't save the note. Please try again."
      : "Couldn't mark this as contacted. Please try again.";
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === "NOTE_EMPTY") return "Write something first.";
  if (error.status === 403) return "Your role can't add notes.";
  if (error.status >= 500) return fallback;
  return error.message;
}

export type NoteCheck = { ok: true; body: string } | { ok: false; message: string };

export function checkNote(raw: string): NoteCheck {
  const body = raw.trim();
  if (!body) return { ok: false, message: "Write something first." };
  if (body.length > NOTE_MAX) {
    return { ok: false, message: `Keep the note to ${NOTE_MAX} characters.` };
  }
  return { ok: true, body };
}
