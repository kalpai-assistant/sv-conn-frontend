/**
 * Bucketing completed jobs into the days of an earnings window (SVC-260).
 *
 * ## Why this is not a one-liner
 *
 * The server defines the week as **Monday 00:00 IST**, and hands back
 * `completed_at` in UTC. Bucketing those timestamps by the *browser's* local day
 * gets the right answer only on a device set to IST.
 *
 * The failure is not hypothetical and not rare at the edges: a job completed at
 * 00:40 IST is `19:10Z` the previous day. Bucket that in UTC and it lands on
 * Tuesday when the provider worked it on Wednesday — and the bars would then sum
 * to a different shape than the week total printed directly above them. Two
 * figures from one response disagreeing on screen is worse than no chart.
 *
 * So every calculation here is done in IST explicitly, by shifting the instant
 * and then reading UTC fields off it. `toLocaleString` with a timeZone would
 * also work, but it returns strings that have to be re-parsed, and the parsing
 * is where locale assumptions creep back in.
 */

/** The server's earnings timezone. Matches `_IST` in `provider_service.py`. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export interface DayBucket {
  /** Mon…Sun, in that order. Single letter — the axis is 7 slots on a phone. */
  label: string;
  /** Full day name, for the tooltip and the screen-reader summary. */
  fullLabel: string;
  /** Total payout for that IST day, tips included. */
  total: number;
  /** Jobs completed that day. Drives "no jobs" in the tooltip. */
  count: number;
  /** True for the IST day the provider is currently in. */
  isToday: boolean;
}

/** Shifted into IST, so the UTC getters below read IST calendar fields. */
function toIst(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

/** Monday = 0 … Sunday = 6, matching Python's `weekday()` that the server uses. */
function istWeekdayIndex(date: Date): number {
  return (toIst(date).getUTCDay() + 6) % 7;
}

const SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Seven buckets, Monday first, always — including the days that have not
 * happened yet.
 *
 * A fixed seven is deliberate. Emitting only the days with earnings would let
 * the axis change width as the week fills, and would render Wednesday alone in
 * the middle of an empty frame with no way to see it *is* Wednesday. The empty
 * days are information: they are the days the provider did not work.
 *
 * `bookings` may be in any order; `now` is injectable so the today-marker is
 * testable without freezing the clock.
 */
export function bucketWeek(
  bookings: { completed_at: string; payout_amount: number }[],
  now: Date = new Date(),
): DayBucket[] {
  const todayIndex = istWeekdayIndex(now);

  const buckets: DayBucket[] = SHORT.map((label, i) => ({
    label,
    fullLabel: FULL[i],
    total: 0,
    count: 0,
    isToday: i === todayIndex,
  }));

  for (const booking of bookings) {
    const completed = new Date(booking.completed_at);
    // A malformed timestamp must not take the whole chart down with it, and
    // must not silently land in Monday's bar either.
    if (Number.isNaN(completed.getTime())) continue;

    const index = istWeekdayIndex(completed);
    buckets[index].total += booking.payout_amount;
    buckets[index].count += 1;
  }

  // Rounding once at the end, not per booking: summing floats and then rounding
  // is what keeps the bars adding up to the window total the card above prints.
  for (const bucket of buckets) {
    bucket.total = Math.round(bucket.total * 100) / 100;
  }

  return buckets;
}

/**
 * Whether the chart is worth drawing at all.
 *
 * Any completed work draws it. An earlier version required two earning days,
 * on the reasoning that one bar among six gaps only repeats what the job row
 * below already says — but that reasoning was about the chart's *value*, and a
 * provider who has worked once and sees no chart reads it as the chart being
 * broken. A thin chart is honest; a missing one is ambiguous.
 *
 * A genuinely empty window is the only case still suppressed: there is no shape
 * to show, and the empty-state copy beneath already says so.
 */
export function isWeekChartWorthShowing(buckets: DayBucket[]): boolean {
  return buckets.some((b) => b.count > 0);
}

// ---------------------------------------------------------------------------
// Month
// ---------------------------------------------------------------------------

/** One calendar day of the current IST month. */
export interface MonthDayBucket {
  /** Day of the month, 1-31. The axis shows only the endpoints; this is for taps. */
  day: number;
  /** "24 Sept" — what the tooltip names, since the axis cannot label 31 bars. */
  fullLabel: string;
  total: number;
  count: number;
  isToday: boolean;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Days in the IST month `date` falls in. Handles February and leap years. */
function istDaysInMonth(date: Date): number {
  const ist = toIst(date);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * One bucket per day of the current month, 1st through the last — including the
 * days that have not happened yet.
 *
 * Fixed length for the same reason the week is fixed at seven: the axis must not
 * change width as the month fills, and the empty days are information. On the
 * first of the month that means one bar and thirty gaps, which is a true picture
 * of a month that has just started.
 *
 * The month length comes from `now`, not from the data: a month with no jobs
 * after the 20th still has its full 30 or 31 slots.
 */
export function bucketMonth(
  bookings: { completed_at: string; payout_amount: number }[],
  now: Date = new Date(),
): MonthDayBucket[] {
  const istNow = toIst(now);
  const todayDay = istNow.getUTCDate();
  const month = istNow.getUTCMonth();
  const year = istNow.getUTCFullYear();
  const length = istDaysInMonth(now);

  const buckets: MonthDayBucket[] = Array.from({ length }, (_, i) => ({
    day: i + 1,
    fullLabel: `${i + 1} ${MONTH_SHORT[month]}`,
    total: 0,
    count: 0,
    isToday: i + 1 === todayDay,
  }));

  for (const booking of bookings) {
    const completed = new Date(booking.completed_at);
    if (Number.isNaN(completed.getTime())) continue;

    const ist = toIst(completed);
    // A booking from another month cannot be placed on this axis. The server
    // only sends the current window, so this is a guard rather than a case —
    // but silently folding a stray August job onto a September bar would be a
    // wrong number on screen, which is the one outcome worth coding against.
    if (ist.getUTCMonth() !== month || ist.getUTCFullYear() !== year) continue;

    const index = ist.getUTCDate() - 1;
    buckets[index].total += booking.payout_amount;
    buckets[index].count += 1;
  }

  for (const bucket of buckets) {
    bucket.total = Math.round(bucket.total * 100) / 100;
  }

  return buckets;
}

/** Whether the month chart is worth drawing. Same rule as the week. */
export function isMonthChartWorthShowing(buckets: MonthDayBucket[]): boolean {
  return buckets.some((b) => b.count > 0);
}
