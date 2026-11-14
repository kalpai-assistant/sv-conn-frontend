/**
 * The SP and Pro directories and the per-SP admin surface (SVC-427). The contract
 * is the backend's app/schemas/admin_team.py and app/routers/admin_team.py. The
 * refusal copy and the audit sentences are ported from the consumer app's
 * src/lib/admin-team.ts (SVC-329), which SVC-434 removes.
 *
 * The backend is the authority on every rule here: the client checks only save a
 * round trip.
 */
import { ApiError } from "@/lib/api";
import type { AdminRole } from "@/lib/auth";
import { humanize, isUuid, type BookingsSearch, type BookingStatus } from "@/lib/bookings";
import { kycStatusLabel, type KycStatus } from "@/lib/kyc";

export const SPS_PAGE_SIZE = 25;
export const PROS_PAGE_SIZE = 25;
export const HISTORY_PAGE_SIZE = 50;
/** The Pro page's recent jobs: the first page of their bookings. */
export const RECENT_JOBS = 10;
/** The SP page's payouts summary: the latest few attempts. */
export const PAYOUT_SUMMARY_SIZE = 5;
/** The reassign picker's page of candidate SPs. */
export const TARGETS_PAGE_SIZE = 25;
/** The backend refuses a shorter `q` with a 422. */
export const SEARCH_MIN = 2;
/** Mirrors the backend's `reason` Field (min_length=3, max_length=500). */
export const REASON_MIN = 3;
export const REASON_MAX = 500;

export const KYC_STATUSES = ["pending", "submitted", "verified", "rejected"] as const;

// --- Types: app/schemas/admin_team.py ----------------------------------------

/** GET /admin/providers: one SP (a user with a provider profile). */
export interface SpRow {
  user_id: string;
  name: string | null;
  phone: string;
  business_name: string | null;
  /** A string, not KycStatus: a status added later must still render. */
  kyc_status: string;
  is_online: boolean;
  user_is_active: boolean;
  /** Active team Pros, the SP's own Pro-for-self not counted. */
  active_pro_count: number;
  created_at: string;
}

export interface ServiceArea {
  lat: number;
  lng: number;
  radius_km: number;
}

export interface SpService {
  id: string;
  name: string;
  /** The catalog row's: false for a retired service. */
  is_active: boolean;
}

/** Bookings CREATED in the last 30 IST days, from IST midnight of `since`. */
export interface BookingVolume {
  /** yyyy-mm-dd, an IST day. */
  since: string;
  total: number;
  by_status: Record<string, number>;
}

/** GET /admin/providers/{id}. */
export interface SpDetail extends SpRow {
  service_area: ServiceArea | null;
  /** The profile's stored average. 0 when nobody has rated them. */
  avg_rating: number;
  total_completed_jobs: number;
  services: SpService[];
  bookings_30d: BookingVolume;
}

/** A Pro row as admin sees it. Removed rows are included (`is_active` false). */
export interface TeamPro {
  id: string;
  service_provider_id: string;
  user_id: string;
  display_name: string;
  phone: string;
  user_is_active: boolean;
  profile_photo_url: string | null;
  /** KYC lives on the row: per SP, never copied between SPs. */
  kyc_status: string;
  is_online: boolean;
  is_active: boolean;
  /** The SP's own Pro-for-self row. Can't be force-removed or reassigned. */
  is_self: boolean;
  /** "Takes jobs themselves" (SVC-326); meaningful on the is_self row. */
  accepts_direct_jobs: boolean;
  active_job_count: number;
  created_at: string;
}

export interface ProOwner {
  user_id: string;
  name: string | null;
  phone: string;
  business_name: string | null;
}

/** GET /admin/pros: a Pro row and the SP it belongs to. kyc_status is the effective one. */
export interface ProRow extends TeamPro {
  service_provider: ProOwner;
}

export interface ProListPage {
  items: ProRow[];
  total: number;
  page: number;
  per_page: number;
}

/** GET /admin/pros/{id}. */
export interface ProDetail extends ProRow {
  /** Null when nobody has reviewed them; 1 decimal place. */
  rating_avg: number | null;
  rating_count: number;
  completed_job_count: number;
}

/** An invite in the SP's history. The backend never sends the code. */
export interface Invite {
  id: string;
  invitee_phone: string;
  status: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  revoked_at: string | null;
}

/** GET /admin/actions: one append-only audit row. */
export interface AdminAction {
  id: string;
  admin_user_id: string;
  admin_name: string | null;
  action: string;
  target_type: string;
  target_id: string;
  /** The SP a Pro was removed or moved from (or the deactivated SP). */
  sp_user_id: string | null;
  /** For a reassign, the SP the person moved to. */
  to_sp_user_id: string | null;
  reason: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ForceRemoveResult {
  professional_id: string;
  /** The SP's last other Pro went while they'd switched off taking jobs, so that's back on. */
  self_reenabled: boolean;
}

export interface ReassignResult {
  old_professional_id: string;
  /** The person's row under the new SP: reactivated (its own KYC) or new (pending). */
  professional: TeamPro;
  reactivated: boolean;
  self_reenabled: boolean;
}

// --- URL state --------------------------------------------------------------

export interface SpsSearch {
  q?: string;
  /** The SP's account: active (true) or deactivated (false). */
  active?: boolean;
  kyc?: KycStatus;
  page?: number;
}

export type ProMembership = "active" | "removed";

export interface ProsSearch {
  q?: string;
  /** Only this SP's Pros: the SP's user id. */
  sp?: string;
  status?: ProMembership;
  kyc?: KycStatus;
  online?: boolean;
  page?: number;
}

// The router JSON-parses each search value, so a phone typed as digits comes back
// a number, and "true" comes back a boolean.
function searchText(value: unknown): string | undefined {
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  return text.length >= SEARCH_MIN ? text : undefined;
}

function bool(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function kyc(value: unknown): KycStatus | undefined {
  return KYC_STATUSES.find((known) => known === value);
}

function pageNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 1 ? value : undefined;
}

/**
 * Anything unknown becomes undefined, explicitly: the router merges the raw URL
 * over what this returns, so leaving a bad key out would keep it.
 */
export function validateSpsSearch(raw: Record<string, unknown>): SpsSearch {
  return {
    q: searchText(raw.q),
    active: bool(raw.active),
    kyc: kyc(raw.kyc),
    page: pageNumber(raw.page),
  };
}

export function validateProsSearch(raw: Record<string, unknown>): ProsSearch {
  return {
    q: searchText(raw.q),
    sp: typeof raw.sp === "string" && isUuid(raw.sp) ? raw.sp.toLowerCase() : undefined,
    status: raw.status === "active" || raw.status === "removed" ? raw.status : undefined,
    kyc: kyc(raw.kyc),
    online: bool(raw.online),
    page: pageNumber(raw.page),
  };
}

export function hasSpFilters(search: SpsSearch): boolean {
  return Boolean(search.q || search.active !== undefined || search.kyc);
}

export function hasProFilters(search: ProsSearch): boolean {
  return Boolean(
    search.q || search.sp || search.status || search.kyc || search.online !== undefined,
  );
}

// --- API paths ----------------------------------------------------------------

const enc = encodeURIComponent;

export function spsListPath(search: SpsSearch): string {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.active !== undefined) params.set("is_active", String(search.active));
  if (search.kyc) params.set("kyc_status", search.kyc);
  params.set("page", String(search.page ?? 1));
  params.set("per_page", String(SPS_PAGE_SIZE));
  return `/admin/providers?${params}`;
}

export function spPath(spId: string): string {
  return `/admin/providers/${enc(spId)}`;
}

export function spTeamPath(spId: string): string {
  return `${spPath(spId)}/team`;
}

export function spInvitesPath(spId: string): string {
  return `${spPath(spId)}/invites`;
}

export function spPayoutSummaryPath(spId: string): string {
  return `${spPath(spId)}/payouts?page=1&per_page=${PAYOUT_SUMMARY_SIZE}`;
}

/** SPs a Pro may be moved to: active and KYC-verified, as the backend requires. */
export function reassignTargetsPath(q: string): string {
  const params = new URLSearchParams({ is_active: "true", kyc_status: "verified" });
  const term = q.trim();
  if (term.length >= SEARCH_MIN) params.set("q", term);
  params.set("page", "1");
  params.set("per_page", String(TARGETS_PAGE_SIZE));
  return `/admin/providers?${params}`;
}

export function prosListPath(search: ProsSearch): string {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.sp) params.set("sp_user_id", search.sp);
  if (search.status) params.set("is_active", String(search.status === "active"));
  if (search.kyc) params.set("kyc_status", search.kyc);
  if (search.online !== undefined) params.set("is_online", String(search.online));
  params.set("page", String(search.page ?? 1));
  params.set("per_page", String(PROS_PAGE_SIZE));
  return `/admin/pros?${params}`;
}

export function proPath(proId: string): string {
  return `/admin/pros/${enc(proId)}`;
}

export function forceRemovePath(proId: string): string {
  return `${proPath(proId)}/force-remove`;
}

export function reassignPath(proId: string): string {
  return `${proPath(proId)}/reassign`;
}

/** Every team action touching an SP, on either side of a reassign. */
export function spActionsPath(spId: string, page: number): string {
  const params = new URLSearchParams({
    sp_user_id: spId,
    page: String(page),
    per_page: String(HISTORY_PAGE_SIZE),
  });
  return `/admin/actions?${params}`;
}

/**
 * This Pro row's history: actions on it, the reassign that landed a person on it,
 * and the deactivation that removed it. The last two need the backend fix to
 * SVC-427's finding; without it they're simply absent.
 */
export function proActionsPath(proId: string, page: number): string {
  const params = new URLSearchParams({
    target_type: "professional",
    target_id: proId,
    page: String(page),
    per_page: String(HISTORY_PAGE_SIZE),
  });
  return `/admin/actions?${params}`;
}

export function proJobsPath(proId: string): string {
  const params = new URLSearchParams({
    professional_id: proId,
    page: "1",
    per_page: String(RECENT_JOBS),
  });
  return `/admin/bookings?${params}`;
}

/** A bare list has no total: there may be more while a page comes back full. */
export function mayHaveMore(rows: unknown[], perPage: number): boolean {
  return rows.length >= perPage;
}

// --- Links into the other screens ---------------------------------------------

/** The bookings screen narrowed to exactly the rows the 30-day volume counted. */
export function spBookingsSearch(
  spId: string,
  volume: Pick<BookingVolume, "since">,
  status?: BookingStatus,
): BookingsSearch {
  return { provider_id: spId, from: volume.since, status };
}

// --- Labels ------------------------------------------------------------------

export function kycLabel(status: string): string {
  return (KYC_STATUSES as readonly string[]).includes(status)
    ? kycStatusLabel(status as KycStatus)
    : humanize(status);
}

/** "Name · Business", whichever exist, else the phone: an SP may never have set a name. */
export function spLabel(sp: Pick<SpRow, "name" | "business_name" | "phone">): string {
  const parts = [sp.name?.trim(), sp.business_name?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : sp.phone;
}

const COORD = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/** "12.9716, 77.5946 · 5 km radius", or "Not set" when the SP never set a centre. */
export function formatServiceArea(area: ServiceArea | null): string {
  if (!area) return "Not set";
  return `${COORD.format(area.lat)}, ${COORD.format(area.lng)} · ${area.radius_km} km radius`;
}

/** The SP's stored average. 0 is what the profile holds before anyone rates them. */
export function formatSpRating(avg: number): string {
  return avg > 0 ? `${avg.toFixed(1)} / 5` : "No ratings yet";
}

export function formatProRating(avg: number | null, count: number): string {
  if (avg === null || count === 0) return "No reviews yet";
  return `${avg.toFixed(1)} / 5 (${count} ${count === 1 ? "review" : "reviews"})`;
}

const IST_DATE = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" });

/** A yyyy-mm-dd IST day as "11 Oct 2026". Parsed as UTC so no zone shifts the day. */
export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : IST_DATE.format(date);
}

export const INVITE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
};

export function inviteStatusLabel(status: string): string {
  const key = status.toLowerCase();
  return INVITE_STATUS_LABELS[key] ?? humanize(key);
}

// --- Roles and rules -----------------------------------------------------------

/** Force remove and reassign: admin and ops. Support only reads (require_roles). */
export function canEditTeam(role: AdminRole): boolean {
  return role === "admin" || role === "ops";
}

/** The backend refuses a removed row (PRO_NOT_FOUND) and a Pro-for-self (CANNOT_*_SELF). */
export function isActionable(pro: Pick<TeamPro, "is_active" | "is_self">): boolean {
  return pro.is_active && !pro.is_self;
}

export type ReasonCheck = { ok: true; reason: string } | { ok: false; message: string };

export function checkReason(raw: string): ReasonCheck {
  const reason = raw.trim();
  if (reason.length < REASON_MIN) {
    return { ok: false, message: `Enter a reason of at least ${REASON_MIN} characters.` };
  }
  if (reason.length > REASON_MAX) {
    return { ok: false, message: `Keep the reason to ${REASON_MAX} characters.` };
  }
  return { ok: true, reason };
}

/**
 * Why an SP can't be the reassign target, or null if it can. The picker already
 * asks only for active, verified SPs; the rest is the same order the backend
 * checks in, so the label matches the 4xx it would send.
 */
export function reassignTargetBlock(row: SpRow, fromSpId: string): string | null {
  if (row.user_id === fromSpId) return "Current team";
  if (!row.user_is_active) return "Deactivated";
  if (row.kyc_status !== "verified") return "KYC not approved";
  return null;
}

// --- Refusals ---------------------------------------------------------------

export const ACTIVE_JOB_COPY = "They're on a job. Finish, cancel or re-pick it first.";

const FORCE_REMOVE_ERRORS: Record<string, string> = {
  PRO_HAS_ACTIVE_JOB: ACTIVE_JOB_COPY,
  PRO_NOT_FOUND: "This Pro is already removed or no longer exists. Reload the page.",
  CANNOT_REMOVE_SELF: "This is the SP's own profile. It can't be removed from their team.",
};

const REASSIGN_ERRORS: Record<string, string> = {
  PRO_HAS_ACTIVE_JOB: ACTIVE_JOB_COPY,
  PRO_NOT_FOUND: "This Pro was already removed or moved. Reload the page.",
  CANNOT_REASSIGN_SELF: "This is the SP's own profile. It can't be moved to another team.",
  SAME_SERVICE_PROVIDER: "They're already on that SP's team. Pick a different SP.",
  TARGET_SP_NOT_FOUND: "That SP no longer exists. Pick a different SP.",
  TARGET_SP_INACTIVE: "That SP's account is deactivated. Pick a different SP.",
  TARGET_SP_KYC_INCOMPLETE: "That SP's KYC isn't approved, so they can't take on Pros yet.",
  USER_INACTIVE: "This person's account is deactivated, so they can't be moved.",
  ALREADY_ON_TEAM: "This person is already an active Pro on that SP's team.",
};

function refusal(err: unknown, table: Record<string, string>, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code && table[err.code]) return table[err.code];
    // FastAPI's own 422, when the reason slips past the client check.
    if (err.status === 422) return `The reason must be ${REASON_MIN}–${REASON_MAX} characters.`;
    if (err.status === 403) return "Your role can't change teams.";
    if (err.status < 500 && err.message) return err.message;
  }
  return fallback;
}

export function forceRemoveErrorCopy(err: unknown): string {
  return refusal(err, FORCE_REMOVE_ERRORS, "Couldn't remove this Pro. Try again.");
}

export function reassignErrorCopy(err: unknown): string {
  return refusal(err, REASSIGN_ERRORS, "Couldn't move this Pro. Try again.");
}

/**
 * For a PRO_HAS_ACTIVE_JOB refusal, the job to link to: the first of
 * `details.booking_ids`, or null when the backend sent none. Undefined for any
 * other error, so the dialog shows no link at all.
 */
export function activeJobId(err: unknown): string | null | undefined {
  if (!(err instanceof ApiError) || err.code !== "PRO_HAS_ACTIVE_JOB") return undefined;
  const ids = err.details?.booking_ids;
  const first = Array.isArray(ids) ? ids.find((id) => typeof id === "string" && isUuid(id)) : null;
  return (first as string | undefined) ?? null;
}

// --- History sentences ------------------------------------------------------------

/** Where a history row points: the other side of a reassign. */
export type ActionLink =
  { kind: "sp"; id: string; label: string } | { kind: "pro"; id: string; label: string };

export interface ActionSentence {
  summary: string;
  notes: string[];
  links: ActionLink[];
}

function spLink(id: string | null, label: string): ActionLink[] {
  return id ? [{ kind: "sp", id, label }] : [];
}

function proLink(id: string | null, label: string): ActionLink[] {
  return id && isUuid(id) ? [{ kind: "pro", id, label }] : [];
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** `oldSp`: whether the old SP's side (their job setting) concerns this viewer. */
function reassignNotes(row: AdminAction, oldSp = true): string[] {
  const notes: string[] = [];
  const status = str(row.details.kyc_status);
  if (row.details.reactivated === true) {
    notes.push(
      `Rejoined an earlier row on the new team, keeping its own KYC${status ? ` (${kycLabel(status)})` : ""}.`,
    );
  } else {
    notes.push("Started with KYC not submitted on the new team.");
  }
  if (oldSp && row.details.self_reenabled === true) {
    notes.push("The old SP was switched back to taking jobs themselves.");
  }
  return notes;
}

/**
 * One audit row as a sentence, from the viewpoint of the SP whose page it's on.
 * `team` is that SP's rows, removed included, to put a name on a Pro id: the log
 * stores ids only.
 */
export function describeSpAction(row: AdminAction, spId: string, team: TeamPro[]): ActionSentence {
  const nameOf = (...ids: (string | null)[]) =>
    team.find((pro) => ids.includes(pro.id) || ids.includes(pro.user_id))?.display_name ?? null;

  if (row.action === "pro_force_removed") {
    const notes =
      row.details.self_reenabled === true
        ? ["The SP was switched back to taking jobs themselves."]
        : [];
    return {
      summary: `${nameOf(row.target_id) ?? "A Pro"} was force-removed from the team`,
      notes,
      links: [],
    };
  }
  if (row.action === "pro_reassigned") {
    const who = nameOf(row.target_id, str(row.details.to_professional_id)) ?? "A Pro";
    const movedAway = row.sp_user_id === spId;
    return {
      summary: movedAway
        ? `${who} was moved to another team`
        : `${who} was moved here from another team`,
      notes: reassignNotes(row),
      links: spLink(movedAway ? row.to_sp_user_id : row.sp_user_id, "Open the other SP"),
    };
  }
  if (row.action === "user_deactivated") {
    const who =
      row.target_id === spId ? "The SP's account" : (nameOf(row.target_id) ?? "A user's account");
    const notes: string[] = [];
    const removed = row.details.removed_professional_ids;
    if (Array.isArray(removed) && removed.length > 0) {
      notes.push(`Removed from ${removed.length} ${removed.length === 1 ? "team" : "teams"}.`);
    }
    const reenabled = row.details.self_reenabled_sp_ids;
    if (Array.isArray(reenabled) && reenabled.includes(spId)) {
      notes.push("The SP was switched back to taking jobs themselves.");
    }
    return { summary: `${who} was deactivated`, notes, links: [] };
  }
  return { summary: humanize(row.action), notes: [], links: [] };
}

/**
 * The same, from the viewpoint of one Pro row. GET /admin/actions for a Pro row
 * returns three kinds (the backend fix to SVC-427's finding): actions targeting
 * the row, the reassign that landed a person on it (details.to_professional_id),
 * and the deactivation that removed it (details.removed_professional_ids).
 */
export function describeProAction(row: AdminAction, proId: string): ActionSentence {
  if (row.action === "pro_force_removed") {
    return { summary: "Force-removed from the team", notes: [], links: [] };
  }
  if (row.action === "pro_reassigned") {
    const landedHere = str(row.details.to_professional_id) === proId && row.target_id !== proId;
    if (landedHere) {
      return {
        summary: "Moved here from another team",
        notes: reassignNotes(row, false),
        links: [
          ...spLink(row.sp_user_id, "Open the old SP"),
          ...proLink(row.target_id, "Open their old Pro row"),
        ],
      };
    }
    return {
      summary: "Moved to another team",
      notes: reassignNotes(row),
      links: [
        ...spLink(row.to_sp_user_id, "Open the new SP"),
        ...proLink(str(row.details.to_professional_id), "Open their new Pro row"),
      ],
    };
  }
  if (row.action === "user_deactivated") {
    return {
      summary: ids(row.details.removed_professional_ids).includes(proId)
        ? "Removed: their account was deactivated"
        : "Their account was deactivated",
      notes: [],
      links: [],
    };
  }
  return { summary: humanize(row.action), notes: [], links: [] };
}

/** Who did it. The join on the admin's user means a name is usually there. */
export function actionActor(row: Pick<AdminAction, "admin_name">): string {
  return row.admin_name?.trim() || "An admin";
}
