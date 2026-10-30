/**
 * Smart human-friendly date formatter — one bucket per temporal distance.
 *
 * The goal is phrasing that reads like how someone would say it out loud:
 * "in 12 min", "today, 3:00 PM", "tomorrow, 10 AM", "Mon 3 PM", "15 Nov".
 * Six buckets, chosen so the user never has to parse an exact date for a
 * nearby event or hunt for the weekday on a far one.
 *
 * Locale is pinned `en-IN` — the SVC-359 locale-drift fix taught us that
 * leaning on the host's default silently differs between CI (full ICU) and
 * dev (small ICU) and dates printed from React tests end up wrong on one
 * machine. See the pitfalls section of SVC-382 for the full history.
 */
import {
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  formatDistanceStrict,
  isSameDay,
  isSameWeek,
  startOfDay,
} from "date-fns";

export interface FormatSmartOptions {
  /** Reference "now". Defaults to `new Date()`. Injected in tests. */
  now?: Date;
}

/**
 * Coerce a `Date | string` to a `Date`. ISO strings arrive from the API and
 * are more common than the `Date` instances they would be after a React
 * Query transform; accepting both avoids pushing the coercion to every call
 * site.
 */
function toDate(input: Date | string): Date {
  return input instanceof Date ? input : new Date(input);
}

/**
 * Format an hour-and-minute time segment the way the shipping brief spells it.
 *
 * - Minute 0: hour alone (`"3 PM"`, `"10 AM"`).
 * - Any other minute: hour and minute (`"3:15 PM"`).
 *
 * The brief writes "Today, 3:00 PM" but "Tomorrow, 10 AM"; the rule driving
 * it is "drop :00 unless it would read oddly". Mixed-minute reads worse than
 * either variant and the catalogue only has slots on the hour or the half,
 * so this covers every real case.
 */
function timeOfDay(d: Date): string {
  return d.getMinutes() === 0 ? format(d, "h a") : format(d, "h:mm a");
}

/**
 * Return the smart-formatted string for `date` relative to `now`.
 *
 * Buckets, in resolution order (first match wins):
 *
 * | When `date` falls                       | Example output        |
 * |-----------------------------------------|-----------------------|
 * | Under 1h in the future                  | `In 12 min`           |
 * | Under 1h in the past                    | `12 min ago`          |
 * | Today, future (≥ 1h out)                | `Today, 3 PM`         |
 * | Today, past (≥ 1h ago)                  | `Today, earlier`      |
 * | Tomorrow                                | `Tomorrow, 10 AM`     |
 * | Within the same calendar week           | `Mon 3 PM`            |
 * | Anywhere else                           | `15 Nov`              |
 *
 * The 1-hour fast-path takes priority over the same-day bucket because a
 * slot 20 minutes away is more usefully labelled "In 20 min" than
 * "Today, 3:20 PM" — the user is actively watching the clock on it.
 *
 * TZ-naive: the `Date` carries the host offset, and all comparisons are
 * local-time. The app never crosses zones mid-session so this is fine; a
 * caller worried about that must pre-convert.
 */
export function formatSmart(date: Date | string, options?: FormatSmartOptions): string {
  const target = toDate(date);
  const now = options?.now ?? new Date();
  const deltaMin = differenceInMinutes(target, now);

  // Sub-hour: minute-granularity countdown. `Math.abs` matches the rounding
  // of the forward direction so `-30s < delta < 30s` renders "In 0 min",
  // which is what a slot at the threshold should read — not a jarring flip
  // between "In 1 min" and "1 min ago" within the same tick.
  if (Math.abs(deltaMin) < 60) {
    return deltaMin >= 0 ? `In ${deltaMin} min` : `${Math.abs(deltaMin)} min ago`;
  }

  if (isSameDay(target, now)) {
    return deltaMin > 0 ? `Today, ${timeOfDay(target)}` : "Today, earlier";
  }

  if (differenceInCalendarDays(target, now) === 1) {
    return `Tomorrow, ${timeOfDay(target)}`;
  }

  // Same calendar week — in `en-IN`, weeks start Sunday. The weekday-plus-time
  // form skips the date number: "Mon 3 PM" is less visual noise than "Mon 15
  // Nov, 3 PM" when the reader already knows it's this week.
  if (isSameWeek(target, now, { weekStartsOn: 0 })) {
    return `${format(target, "EEE")} ${timeOfDay(target)}`;
  }

  // Far: day + abbreviated month. Year omitted because every surface showing
  // this is a slot in the next few months — a year on "15 Nov 2027" reads as
  // emphasis the data doesn't support.
  return format(target, "d MMM");
}

/**
 * How long ago something past happened, at day granularity — the attribution
 * on a review snippet ("— Priya, 2 days ago", SVC-388).
 *
 * "today" and "yesterday" are ours; anything older defers to date-fns' strict
 * distance with `addSuffix`, the wording the admin routes already print via
 * `formatDistanceToNowStrict` ("5 days ago", "2 months ago"). This uses the
 * `formatDistanceStrict` form of the same call so `now` stays injectable.
 *
 * Measured between the two calendar days, not the raw timestamps: a review
 * from 11 PM two days back reads "2 days ago" all morning instead of
 * "1 day ago" until 11 PM.
 */
export function formatDaysAgo(date: Date | string, options?: FormatSmartOptions): string {
  const target = toDate(date);
  const now = options?.now ?? new Date();
  const days = differenceInCalendarDays(now, target);

  // A clock-skewed future timestamp clamps to "today" rather than "in 2 hours".
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return formatDistanceStrict(startOfDay(target), startOfDay(now), {
    addSuffix: true,
    roundingMethod: "floor",
  });
}
