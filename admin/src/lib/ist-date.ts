/**
 * Calendar dates for scheduled commission changes (SVC-486). The backend counts
 * days in IST: a change takes effect at 00:00 IST on its `effective_from`, and
 * "today" is today in Asia/Kolkata (app/services/commission_changes.py,
 * today_ist), whatever the browser's own time zone is.
 *
 * Dates are "YYYY-MM-DD" strings throughout, the shape the API sends and takes
 * and the value an <input type="date"> holds. They never pass through the
 * browser's time zone: arithmetic and formatting both run in UTC, so a date
 * can't shift by a day.
 */

const IST_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in IST as "YYYY-MM-DD". en-CA formats dates in that order. */
export function todayIst(now: Date = new Date()): string {
  return IST_DAY.format(now);
}

/** "2026-02-27" + 2 → "2026-03-01". */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const SHOWN_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "2026-12-06" → "6 Dec 2026". */
export function formatEffectiveDate(iso: string): string {
  return SHOWN_DAY.format(new Date(`${iso}T00:00:00Z`));
}
