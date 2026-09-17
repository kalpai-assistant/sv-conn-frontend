/**
 * Bucketing completed jobs into the seven days of the earnings week (SVC-260).
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
 * One bar and six flat lines says "Wednesday" — which the job row underneath
 * already says, with the service name, the time and the amount. Below two
 * earning days the rows carry strictly more, so the chart is suppressed rather
 * than shown empty.
 *
 * This is the rule that keeps the chart from being decoration on a quiet week.
 */
export function isWeekChartWorthShowing(buckets: DayBucket[]): boolean {
  return buckets.filter((b) => b.count > 0).length >= 2;
}
