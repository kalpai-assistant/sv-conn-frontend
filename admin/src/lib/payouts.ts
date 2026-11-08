/**
 * The payouts screen (SVC-426). The contract is in the backend's app/routers/admin.py
 * and app/schemas/payout.py: GET /admin/payouts/providers, GET
 * /admin/providers/{id}/payout-bookings and /payouts, POST .../payout and the two
 * requeues, and GET /admin/payouts/export.csv. Every amount is paise, with the
 * unit in the field name.
 *
 * The Pay out guard is ported from the consumer app's src/routes/admin.payouts.tsx,
 * which SVC-434 removes, and extended to the refusals the backend's Celery task
 * makes after its 202 (see payOutBlock).
 */
import type { AdminRole } from "@/lib/auth";
import { isUuid } from "@/lib/bookings";
import { kycStatusLabel, type KycStatus } from "@/lib/kyc";

export const PAYOUTS_PAGE_SIZE = 25;
export const PAYOUT_BOOKINGS_PAGE_SIZE = 25;
export const PAYOUT_HISTORY_PAGE_SIZE = 25;

export const SETTLEMENT_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "reversed",
] as const;

export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Paid",
  failed: "Failed",
  reversed: "Reversed",
};

/** One SP on the list: PayoutDashboardProvider. */
export interface PayoutProvider {
  provider_id: string;
  name: string | null;
  business_name: string | null;
  phone: string;
  is_active: boolean;
  payout_set: boolean;
  kyc_status: string;
  pending_count: number;
  pending_paise: number;
  processing_count: number;
  processing_paise: number;
  completed_count: number;
  completed_paise: number;
  failed_count: number;
  failed_paise: number;
  reversed_count: number;
  reversed_paise: number;
  earned_count: number;
  earned_paise: number;
  /** What a Pay out would send now: the wallet balance. Can be below pending_paise. */
  payable_paise: number;
  latest_failure_reason: string | null;
}

export interface PayoutProvidersPage {
  providers: PayoutProvider[];
  total: number;
  page: number;
  per_page: number;
}

/** One booking behind an SP's figures: PayoutBookingRow. */
export interface PayoutBooking {
  booking_id: string;
  completed_at: string | null;
  /** The price fixed at booking time. There is no locked_price column (SVC-406/410). */
  service_amount_paise: number;
  discount_amount_paise: number;
  platform_commission_paise: number;
  provider_payout_paise: number;
  tip_amount_paise: number;
  /** A string, not SettlementStatus: a status added later must still render. */
  settlement_status: string;
  settlement_payout_id: string | null;
  settlement_failure_reason: string | null;
  professional_name: string | null;
}

export interface PayoutBookingsPage {
  bookings: PayoutBooking[];
  total: number;
  page: number;
  per_page: number;
}

/** One payout_audits row: ProviderPayoutHistoryEntry. */
export interface PayoutHistoryEntry {
  audit_id: string;
  payout_id: string | null;
  reference_id: string | null;
  amount_paise: number;
  booking_count: number;
  /** Free-form on the backend, passed through verbatim. */
  outcome: string;
  /** "admin" | "reconciliation". */
  source: string;
  admin_user_id: string | null;
  admin_name: string | null;
  error: string | null;
  created_at: string;
}

export interface PayoutHistoryPage {
  entries: PayoutHistoryEntry[];
  total: number;
  page: number;
  per_page: number;
}

/** The 202 from POST /admin/providers/{id}/payout. */
export interface PayoutQueued {
  status: string;
  task_id: string;
  amount_paise: number;
  booking_count: number;
}

export interface Requeued {
  requeued: number;
}

/** What the URL holds. A bare /operator/payouts is the default view. */
export interface PayoutsSearch {
  /** Keep SPs with a booking in this bucket. */
  status?: SettlementStatus;
  page?: number;
  /** The open SP's user id. */
  sp?: string;
  /** The open SP's bookings: their own filter and page. */
  bstatus?: SettlementStatus;
  bpage?: number;
  /** The open SP's history page. */
  hpage?: number;
}

function settlementStatus(value: unknown): SettlementStatus | undefined {
  return SETTLEMENT_STATUSES.find((known) => known === value);
}

function pageNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 1 ? value : undefined;
}

/**
 * Anything unknown becomes undefined, explicitly: the router merges the raw URL
 * over what this returns, so leaving a bad key out would keep it.
 */
export function validatePayoutsSearch(raw: Record<string, unknown>): PayoutsSearch {
  return {
    status: settlementStatus(raw.status),
    page: pageNumber(raw.page),
    sp: typeof raw.sp === "string" && isUuid(raw.sp) ? raw.sp.toLowerCase() : undefined,
    bstatus: settlementStatus(raw.bstatus),
    bpage: pageNumber(raw.bpage),
    hpage: pageNumber(raw.hpage),
  };
}

export function payoutProvidersPath(search: Pick<PayoutsSearch, "status" | "page">): string {
  const params = new URLSearchParams();
  if (search.status) params.set("status", search.status);
  params.set("page", String(search.page ?? 1));
  params.set("per_page", String(PAYOUTS_PAGE_SIZE));
  return `/admin/payouts/providers?${params}`;
}

function providerPath(providerId: string): string {
  return `/admin/providers/${encodeURIComponent(providerId)}`;
}

export function payoutBookingsPath(
  providerId: string,
  status: SettlementStatus | undefined,
  page: number,
): string {
  const params = new URLSearchParams();
  if (status) params.set("settlement_status", status);
  params.set("page", String(page));
  params.set("per_page", String(PAYOUT_BOOKINGS_PAGE_SIZE));
  return `${providerPath(providerId)}/payout-bookings?${params}`;
}

export function payoutHistoryPath(providerId: string, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(PAYOUT_HISTORY_PAGE_SIZE),
  });
  return `${providerPath(providerId)}/payouts?${params}`;
}

export function payOutPath(providerId: string): string {
  return `${providerPath(providerId)}/payout`;
}

export type RequeueKind = "failed" | "reversed";

export function requeuePath(providerId: string, kind: RequeueKind): string {
  return `${providerPath(providerId)}/payout/requeue-${kind}`;
}

export function exportCsvPath(from: string, to: string): string {
  return `/admin/payouts/export.csv?${new URLSearchParams({ from, to })}`;
}

/** The name the backend's Content-Disposition carries, for when the browser hides it. */
export function exportCsvFilename(from: string, to: string): string {
  return `payouts_${from}_${to}.csv`;
}

/** business_name, else name, else phone: a provider may never have set a name. */
export function providerDisplayName(
  provider: Pick<PayoutProvider, "business_name" | "name" | "phone">,
): string {
  return provider.business_name?.trim() || provider.name?.trim() || provider.phone;
}

export function settlementLabel(status: string): string {
  return SETTLEMENT_STATUS_LABELS[status as SettlementStatus] ?? humanize(status);
}

const KYC_STATUSES = new Set(["pending", "submitted", "verified", "rejected"]);

/** The KYC screen's words for a status (verified reads "Approved"). */
export function kycLabel(status: string): string {
  return KYC_STATUSES.has(status) ? kycStatusLabel(status as KycStatus) : humanize(status);
}

const OUTCOME_LABELS: Record<string, string> = {
  attempting: "Attempting",
  unknown: "Unknown (awaiting reconciliation)",
  initiated: "Initiated",
  queued: "Queued at RazorpayX",
  processing: "Processing",
  processed: "Processed",
  completed: "Completed",
  failed: "Failed",
  rejected: "Rejected",
  reversed: "Reversed",
  requeued: "Re-queued",
};

export function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? humanize(outcome);
}

/** A reconciliation row is the nightly job repairing state, not a person. */
export function historySource(entry: Pick<PayoutHistoryEntry, "source">): string {
  return entry.source === "reconciliation" ? "System" : humanize(entry.source);
}

export function historyActor(
  entry: Pick<PayoutHistoryEntry, "source" | "admin_name" | "admin_user_id">,
): string {
  if (entry.admin_name) return entry.admin_name;
  if (entry.admin_user_id) return "Unnamed admin";
  return entry.source === "reconciliation" ? "System" : "Unknown";
}

function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : value;
}

// --- The Pay out guard ------------------------------------------------------

/** Legacy's in-flight window: two clicks a few seconds apart are the case it stops. */
export const IN_FLIGHT_WINDOW_MS = 60_000;

/** Outcomes that aren't final, so money may be on its way. Legacy's set, verbatim. */
export const IN_FLIGHT_OUTCOMES = new Set([
  "attempting",
  "unknown",
  "initiated",
  "queued",
  "processing",
]);

/**
 * Outcomes the backend's open-attempt gate (SVC-172) refuses on, at any age:
 * PayoutService._find_open_attempt. Only reconciliation clears them.
 */
export const UNRESOLVED_OUTCOMES = new Set(["attempting", "unknown"]);

/**
 * Legacy's rule, ported as it was: the newest in-flight entry from the last 60 s,
 * whether or not it's the newest entry overall. Entries come newest first.
 */
export function findInFlightPayout(
  entries: PayoutHistoryEntry[],
  now: number,
): PayoutHistoryEntry | null {
  const cutoff = now - IN_FLIGHT_WINDOW_MS;
  for (const entry of entries) {
    if (!IN_FLIGHT_OUTCOMES.has(entry.outcome)) continue;
    if (new Date(entry.created_at).getTime() < cutoff) continue;
    return entry;
  }
  return null;
}

/** The newest attempting/unknown entry on the page we have, at any age. */
export function findUnresolvedAttempt(entries: PayoutHistoryEntry[]): PayoutHistoryEntry | null {
  return entries.find((entry) => UNRESOLVED_OUTCOMES.has(entry.outcome)) ?? null;
}

/** The history the guard reads: page 1, or why we don't have it. */
export type GuardHistory =
  { status: "ready"; entries: PayoutHistoryEntry[] } | { status: "loading" } | { status: "error" };

/**
 * Why Pay out is disabled right now, or null when it isn't.
 *
 * The backend answers 202 before its Celery task looks at anything, and the task
 * then refuses a KYC that isn't verified, a missing payout method, no pending
 * booking, or an open attempt, without writing a history row. So each of those is checked here, or
 * the admin would see "Queued" for a payout that never happens. The backend
 * stays the authority: this sees only page 1 of the history.
 *
 * `queuedAt` is this screen's own 202, in ms: the worker may not have written its
 * attempting row yet when the history is fetched again.
 */
export function payOutBlock(
  provider: Pick<PayoutProvider, "payout_set" | "kyc_status" | "payable_paise" | "pending_count">,
  history: GuardHistory,
  now: number,
  queuedAt: number | null = null,
): string | null {
  if (!provider.payout_set) {
    return "No payout method on file. The SP has to add a UPI ID or bank account first.";
  }
  if (provider.kyc_status !== "verified") {
    return `KYC isn't approved (${kycLabel(provider.kyc_status)}). Review it on the KYC screen first.`;
  }
  if (provider.payable_paise <= 0) {
    return "Nothing to send right now.";
  }
  // The task pays out pending bookings (the same filter as pending_count), so a
  // wallet balance with none of them pending is refused after the 202 too.
  if (provider.pending_count === 0) {
    return "No pending bookings to pay out.";
  }
  // What the history shows explains a block better than "just queued", so it goes first.
  if (history.status === "ready") {
    if (findUnresolvedAttempt(history.entries)) {
      return "Previous attempt unresolved; wait for reconciliation.";
    }
    const inFlight = findInFlightPayout(history.entries, now);
    if (inFlight) {
      const seconds = Math.max(
        0,
        Math.round((now - new Date(inFlight.created_at).getTime()) / 1000),
      );
      return `A payout from ${seconds}s ago is still ${outcomeLabel(inFlight.outcome).toLowerCase()}. Wait for it to finish.`;
    }
  }
  if (queuedAt !== null && now - queuedAt < IN_FLIGHT_WINDOW_MS) {
    return "A payout was just queued. Wait for it to show in the history.";
  }
  if (history.status === "loading") {
    return "Checking the payout history…";
  }
  if (history.status === "error") {
    return "Couldn't load the payout history, so an earlier attempt can't be ruled out.";
  }
  return null;
}

/** When the guard's 60 s windows next run out, so the screen can look again. */
export function nextGuardChange(
  history: GuardHistory,
  now: number,
  queuedAt: number | null,
): number | null {
  const times: number[] = [];
  if (queuedAt !== null && now - queuedAt < IN_FLIGHT_WINDOW_MS) {
    times.push(queuedAt + IN_FLIGHT_WINDOW_MS);
  }
  if (history.status === "ready") {
    const inFlight = findInFlightPayout(history.entries, now);
    if (inFlight) {
      times.push(new Date(inFlight.created_at).getTime() + IN_FLIGHT_WINDOW_MS);
    }
  }
  return times.length ? Math.min(...times) : null;
}

// --- Roles: SVC-422's table, and the backend's require_roles on each route ---

export function canPayOut(role: AdminRole): boolean {
  return role === "admin" || role === "ops";
}

export function canRequeueFailed(role: AdminRole): boolean {
  return role === "admin" || role === "ops";
}

/** Admin only: the backend treats a reversal as a compliance signal. */
export function canRequeueReversed(role: AdminRole): boolean {
  return role === "admin";
}

export function lastPage(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}
