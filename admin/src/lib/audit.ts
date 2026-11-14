/**
 * The audit log (SVC-423). The contract is GET /admin/audit and /admin/audit/filters
 * in the backend's app/routers/admin_audit.py. Read-only: entries are immutable.
 */

export const AUDIT_PAGE_SIZE = 50;

export interface AuditEntry {
  id: string;
  admin_user_id: string;
  admin_name: string | null;
  admin_email: string | null;
  action: string;
  target_type: string;
  target_id: string;
  sp_user_id: string | null;
  to_sp_user_id: string | null;
  reason: string | null;
  details: Record<string, unknown>;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  per_page: number;
}

export interface AuditAdmin {
  id: string;
  name: string | null;
  email: string | null;
}

export interface AuditFilterOptions {
  admins: AuditAdmin[];
  actions: string[];
  target_types: string[];
}

/** What the filter controls hold. An empty string means no filter. */
export interface AuditFilters {
  adminUserId: string;
  action: string;
  targetType: string;
  /** A date input's value, yyyy-mm-dd, in the admin's local time. */
  from: string;
  to: string;
}

export const NO_AUDIT_FILTERS: AuditFilters = {
  adminUserId: "",
  action: "",
  targetType: "",
  from: "",
  to: "",
};

// A date input reports a value on every keystroke, so typing 2026 passes through
// the years 0002, 0020 and 0202. Those aren't the date the admin means, and year 1
// can turn into year 0 in UTC, which the backend refuses with a 422.
function isCompleteDate(date: string): boolean {
  return /^[1-9]\d{3}-\d{2}-\d{2}$/.test(date);
}

// With a time and no offset, Date reads the string as local time. Without the
// time it would read it as UTC, which is the wrong day in India before 05:30.
function localMidnight(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

/** The instant a local day starts, as `date_from` (inclusive). */
export function startOfLocalDay(date: string): string {
  return localMidnight(date).toISOString();
}

/** The instant after a local day ends, as `date_to` (exclusive), so the whole day is included. */
export function endOfLocalDay(date: string): string {
  const next = localMidnight(date);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export function auditPath(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.adminUserId) params.set("admin_user_id", filters.adminUserId);
  if (filters.action) params.set("action", filters.action);
  if (filters.targetType) params.set("target_type", filters.targetType);
  if (isCompleteDate(filters.from)) params.set("date_from", startOfLocalDay(filters.from));
  if (isCompleteDate(filters.to)) params.set("date_to", endOfLocalDay(filters.to));
  params.set("page", String(page));
  params.set("per_page", String(AUDIT_PAGE_SIZE));
  return `/admin/audit?${params}`;
}

/** The name to show for an admin. Both name and email can be null, so the id is the last resort. */
export function adminLabel(name: string | null, email: string | null, id: string): string {
  return name || email || id;
}

/** The longer form, for a dropdown and the expanded row, where two admins may share a name. */
export function adminFullLabel(name: string | null, email: string | null, id: string): string {
  return name && email ? `${name} (${email})` : adminLabel(name, email, id);
}

/** A timestamp in the admin's local time. An unreadable one is shown as it came. */
export function formatAuditTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

/** Indented JSON, or null when there is nothing to show (no value, or an empty object). */
export function formatAuditJson(value: Record<string, unknown> | null): string | null {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }
  return JSON.stringify(value, null, 2);
}
