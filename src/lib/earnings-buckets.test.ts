/**
 * Bucketing the earnings window into days (SVC-260).
 *
 * The bug worth a test file: the server defines the week as **Monday 00:00
 * IST** and returns `completed_at` in UTC. Bucketing by the browser's local day
 * is right only on a device set to IST, and wrong in a way nobody notices —
 * a job at 00:40 IST is 19:10Z the day before, so it lands one bar to the left
 * and the bars stop summing to the week total printed above them.
 *
 * These tests run in whatever timezone CI happens to use, so any local-time
 * arithmetic that crept back in would fail here rather than on a provider's
 * phone.
 */
import { describe, expect, it } from "vitest";

import {
  bucketMonth,
  bucketWeek,
  isMonthChartWorthShowing,
  isWeekChartWorthShowing,
} from "@/lib/earnings-buckets";

const job = (completed_at: string, payout_amount = 100) => ({ completed_at, payout_amount });

// Thursday 17 Sept 2026, mid-morning IST. Monday that week is the 14th.
const THU = new Date("2026-09-17T06:00:00Z");

describe("the seven buckets", () => {
  it("always returns Monday through Sunday, even for an empty week", () => {
    const buckets = bucketWeek([], THU);

    expect(buckets).toHaveLength(7);
    expect(buckets.map((b) => b.label)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    expect(buckets.map((b) => b.fullLabel)[0]).toBe("Monday");
    expect(buckets.every((b) => b.total === 0 && b.count === 0)).toBe(true);
  });

  it("keeps days with no work as empty bars rather than dropping them", () => {
    // The empty days are information — they are the days the provider did not
    // work. Dropping them would also let the axis change width as a week fills.
    const buckets = bucketWeek([job("2026-09-17T06:00:00Z", 349)], THU);

    expect(buckets).toHaveLength(7);
    expect(buckets[3].total).toBe(349);
    expect(buckets.filter((b) => b.count === 0)).toHaveLength(6);
  });
});

describe("IST bucketing", () => {
  it("puts a job completed just after IST midnight on that IST day", () => {
    // 2026-09-16T19:10Z is 2026-09-17T00:40 IST — Thursday, not Wednesday.
    // Bucketing this in UTC is the bug this whole module exists to avoid.
    const buckets = bucketWeek([job("2026-09-16T19:10:00Z", 349)], THU);

    expect(buckets[3].total).toBe(349); // Thursday
    expect(buckets[2].total).toBe(0); // Wednesday
  });

  it("puts a job completed just before IST midnight on the earlier day", () => {
    // 2026-09-16T18:20Z is 2026-09-16T23:50 IST — still Wednesday.
    const buckets = bucketWeek([job("2026-09-16T18:20:00Z", 200)], THU);

    expect(buckets[2].total).toBe(200); // Wednesday
    expect(buckets[3].total).toBe(0); // Thursday
  });

  it("starts the week on Monday, matching the server's window", () => {
    // Python's weekday(): Monday 0 … Sunday 6. A Sunday job belongs last, not
    // first — a week starting Sunday would shift every bar by one.
    const monday = bucketWeek([job("2026-09-14T06:00:00Z")], THU);
    const sunday = bucketWeek([job("2026-09-20T06:00:00Z")], THU);

    expect(monday[0].count).toBe(1);
    expect(sunday[6].count).toBe(1);
  });
});

describe("totals", () => {
  it("sums several jobs landing on one day", () => {
    const buckets = bucketWeek(
      [job("2026-09-17T06:00:00Z", 349), job("2026-09-17T11:00:00Z", 559)],
      THU,
    );

    expect(buckets[3].total).toBe(908);
    expect(buckets[3].count).toBe(2);
  });

  it("keeps the bars summing to the window total despite float payouts", () => {
    // The card above the chart prints the server's total. If rounding per
    // booking made these disagree, the screen would show two answers to one
    // question — worse than having no chart.
    const bookings = [
      job("2026-09-14T06:00:00Z", 33.33),
      job("2026-09-15T06:00:00Z", 33.33),
      job("2026-09-16T06:00:00Z", 33.34),
    ];
    const buckets = bucketWeek(bookings, THU);
    const summed = buckets.reduce((acc, b) => acc + b.total, 0);

    expect(Math.round(summed * 100) / 100).toBe(100);
  });

  it("ignores a malformed timestamp instead of banking it on Monday", () => {
    // `new Date("nonsense")` is NaN, and NaN arithmetic would quietly land the
    // amount in bucket 0 while taking no visible blame.
    const buckets = bucketWeek([job("not a date", 999), job("2026-09-17T06:00:00Z", 349)], THU);

    expect(buckets[0].total).toBe(0);
    expect(buckets[3].total).toBe(349);
  });

  it("does not care what order the bookings arrive in", () => {
    const forward = bucketWeek(
      [job("2026-09-14T06:00:00Z", 10), job("2026-09-17T06:00:00Z", 20)],
      THU,
    );
    const reversed = bucketWeek(
      [job("2026-09-17T06:00:00Z", 20), job("2026-09-14T06:00:00Z", 10)],
      THU,
    );

    expect(forward.map((b) => b.total)).toEqual(reversed.map((b) => b.total));
  });
});

describe("today", () => {
  it("marks exactly one day, by IST", () => {
    const buckets = bucketWeek([], THU);

    expect(buckets.filter((b) => b.isToday)).toHaveLength(1);
    expect(buckets[3].isToday).toBe(true); // Thursday
  });

  it("marks the next IST day for a late-evening UTC instant", () => {
    // 2026-09-16T20:00Z is Thursday 01:30 IST — the UTC date still reads
    // Wednesday, so a local-time reading would mark the wrong bar.
    const buckets = bucketWeek([], new Date("2026-09-16T20:00:00Z"));

    expect(buckets[3].isToday).toBe(true);
  });
});

describe("whether to draw it at all", () => {
  it("suppresses the chart on a single earning day", () => {
    // One bar and six flat lines says which day — which the job row below
    // already says, with the service, the time and the amount.
    const buckets = bucketWeek([job("2026-09-17T06:00:00Z", 349)], THU);

    expect(isWeekChartWorthShowing(buckets)).toBe(false);
  });

  it("suppresses it on an empty week", () => {
    expect(isWeekChartWorthShowing(bucketWeek([], THU))).toBe(false);
  });

  it("shows it from two earning days, where shape becomes real information", () => {
    const buckets = bucketWeek(
      [job("2026-09-14T06:00:00Z", 349), job("2026-09-17T06:00:00Z", 559)],
      THU,
    );

    expect(isWeekChartWorthShowing(buckets)).toBe(true);
  });

  it("counts days, not jobs — three jobs on one day is still one bar", () => {
    const buckets = bucketWeek(
      [
        job("2026-09-17T06:00:00Z", 100),
        job("2026-09-17T08:00:00Z", 100),
        job("2026-09-17T10:00:00Z", 100),
      ],
      THU,
    );

    expect(isWeekChartWorthShowing(buckets)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Month
// ---------------------------------------------------------------------------

describe("the month buckets", () => {
  it("spans the whole month, 1st through last, however far in we are", () => {
    // Length comes from the calendar, not the data: a month with no jobs after
    // the 17th still has all 30 slots, and the axis must not grow as it fills.
    const buckets = bucketMonth([job("2026-09-17T06:00:00Z", 349)], THU);

    expect(buckets).toHaveLength(30); // September
    expect(buckets[0].day).toBe(1);
    expect(buckets[29].day).toBe(30);
  });

  it("gets February right in a non-leap year", () => {
    const buckets = bucketMonth([], new Date("2026-02-10T06:00:00Z"));
    expect(buckets).toHaveLength(28);
  });

  it("gets February right in a leap year", () => {
    const buckets = bucketMonth([], new Date("2028-02-10T06:00:00Z"));
    expect(buckets).toHaveLength(29);
  });

  it("gets a 31-day month right", () => {
    const buckets = bucketMonth([], new Date("2026-10-10T06:00:00Z"));
    expect(buckets).toHaveLength(31);
  });

  it("labels each bar with its date, for the tap readout", () => {
    const buckets = bucketMonth([], THU);

    expect(buckets[0].fullLabel).toBe("1 Sep");
    expect(buckets[16].fullLabel).toBe("17 Sep");
  });
});

describe("month bucketing is IST too", () => {
  it("puts a job just after IST midnight on that IST day", () => {
    // 2026-09-16T19:10Z is 17 Sept 00:40 IST.
    const buckets = bucketMonth([job("2026-09-16T19:10:00Z", 349)], THU);

    expect(buckets[16].total).toBe(349); // 17th
    expect(buckets[15].total).toBe(0); // 16th
  });

  it("puts a job just before IST midnight on the earlier day", () => {
    const buckets = bucketMonth([job("2026-09-16T18:20:00Z", 200)], THU);

    expect(buckets[15].total).toBe(200); // 16th
    expect(buckets[16].total).toBe(0);
  });

  it("marks today by IST, not by the UTC date", () => {
    // 2026-09-16T20:00Z is 17 Sept 01:30 IST — the UTC date still reads the 16th.
    const buckets = bucketMonth([], new Date("2026-09-16T20:00:00Z"));

    expect(buckets.filter((b) => b.isToday)).toHaveLength(1);
    expect(buckets[16].isToday).toBe(true);
  });
});

describe("month totals", () => {
  it("sums several jobs on one day", () => {
    const buckets = bucketMonth(
      [job("2026-09-17T06:00:00Z", 499), job("2026-09-17T11:00:00Z", 389)],
      THU,
    );

    expect(buckets[16].total).toBe(888);
    expect(buckets[16].count).toBe(2);
  });

  it("drops a booking from another month rather than folding it onto a bar", () => {
    // The server only sends the current window, so this is a guard — but
    // silently banking an August job onto a September day would be a wrong
    // number on screen, which is the outcome worth coding against.
    const buckets = bucketMonth(
      [job("2026-08-17T06:00:00Z", 999), job("2026-09-17T06:00:00Z", 349)],
      THU,
    );

    expect(buckets[16].total).toBe(349);
    expect(buckets.reduce((a, b) => a + b.total, 0)).toBe(349);
  });

  it("ignores a malformed timestamp", () => {
    const buckets = bucketMonth([job("not a date", 999), job("2026-09-17T06:00:00Z", 349)], THU);

    expect(buckets[0].total).toBe(0);
    expect(buckets[16].total).toBe(349);
  });
});

describe("whether to draw the month chart", () => {
  it("suppresses it on a single earning day", () => {
    // The 1st of the month is one bar and thirty gaps.
    const buckets = bucketMonth([job("2026-09-17T06:00:00Z", 349)], THU);

    expect(isMonthChartWorthShowing(buckets)).toBe(false);
  });

  it("suppresses it on an empty month", () => {
    expect(isMonthChartWorthShowing(bucketMonth([], THU))).toBe(false);
  });

  it("shows it from two earning days", () => {
    const buckets = bucketMonth(
      [job("2026-09-14T06:00:00Z", 349), job("2026-09-17T06:00:00Z", 559)],
      THU,
    );

    expect(isMonthChartWorthShowing(buckets)).toBe(true);
  });
});
