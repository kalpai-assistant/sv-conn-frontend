/**
 * `formatSmart`'s contract (SVC-382).
 *
 * The buckets below mirror the table in `date.ts` so a renamed phrase or a
 * boundary tweak surfaces here first. Six buckets, each covered with a case
 * on each side of its boundary — the sub-hour/today boundary is where a
 * naive implementation most often slips.
 *
 * `vi.setSystemTime` pins "now" so every test runs against the same virtual
 * clock; `vi.useRealTimers` in `afterEach` keeps the vitest process honest
 * for the next file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDaysAgo, formatSmart } from "@/lib/date";

// Pin a mid-week afternoon so the "this week" bucket has clean neighbours on
// both sides without crossing a calendar-week boundary unintentionally.
// Wed 11 Nov 2026, 14:00 local — same as `new Date(2026, 10, 11, 14, 0)`.
const NOW = new Date(2026, 10, 11, 14, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatSmart — sub-hour fast-path", () => {
  it("formats a 12-minute future slot as `In 12 min`", () => {
    expect(formatSmart(new Date(2026, 10, 11, 14, 12))).toBe("In 12 min");
  });

  it("formats a 12-minute past slot as `12 min ago`", () => {
    expect(formatSmart(new Date(2026, 10, 11, 13, 48))).toBe("12 min ago");
  });

  it("renders a slot exactly `now` as `In 0 min` — never flips sign mid-tick", () => {
    // Verifies the symmetric-round boundary. If we rounded differently in each
    // direction, a slot sitting on the second-level boundary would alternate
    // between "In 1 min" and "1 min ago" between ticks.
    expect(formatSmart(NOW)).toBe("In 0 min");
  });

  it("rolls into the `Today` bucket at exactly 60 minutes out", () => {
    expect(formatSmart(new Date(2026, 10, 11, 15, 0))).toBe("Today, 3 PM");
  });
});

describe("formatSmart — Today bucket", () => {
  it("renders a future same-day slot with the time", () => {
    expect(formatSmart(new Date(2026, 10, 11, 18, 30))).toBe("Today, 6:30 PM");
  });

  it("renders an on-the-hour slot without `:00`", () => {
    expect(formatSmart(new Date(2026, 10, 11, 18, 0))).toBe("Today, 6 PM");
  });

  it("renders a same-day past slot as `Today, earlier`", () => {
    expect(formatSmart(new Date(2026, 10, 11, 9, 0))).toBe("Today, earlier");
  });
});

describe("formatSmart — Tomorrow bucket", () => {
  it("renders a tomorrow slot with the time", () => {
    expect(formatSmart(new Date(2026, 10, 12, 10, 0))).toBe("Tomorrow, 10 AM");
  });

  it("keeps `Tomorrow` when the slot is far into tomorrow", () => {
    expect(formatSmart(new Date(2026, 10, 12, 23, 30))).toBe("Tomorrow, 11:30 PM");
  });
});

describe("formatSmart — This week bucket", () => {
  it("renders a weekday-plus-time for a slot later this week", () => {
    // NOW is Wed; Fri 13 Nov 2026 is still the same calendar week.
    expect(formatSmart(new Date(2026, 10, 13, 15, 0))).toBe("Fri 3 PM");
  });

  it("renders a weekday-plus-time for a slot earlier this week", () => {
    // Mon 9 Nov 2026 is the same calendar week as Wed 11 Nov (en-IN, Sun start).
    expect(formatSmart(new Date(2026, 10, 9, 10, 0))).toBe("Mon 10 AM");
  });
});

describe("formatSmart — Far bucket", () => {
  it("renders a slot in a later week as `day month`", () => {
    expect(formatSmart(new Date(2026, 10, 20, 15, 0))).toBe("20 Nov");
  });

  it("renders a next-month slot as `day month`", () => {
    expect(formatSmart(new Date(2026, 11, 3, 10, 0))).toBe("3 Dec");
  });

  it("renders a past far slot as `day month` — no `ago` suffix past a week", () => {
    expect(formatSmart(new Date(2026, 9, 20, 10, 0))).toBe("20 Oct");
  });
});

describe("formatSmart — input shapes", () => {
  it("accepts an ISO string", () => {
    // The booking API returns `scheduled_at` as an ISO string with a Z
    // suffix; call sites render it directly rather than via `new Date(..)`
    // first, so the helper has to accept both.
    const iso = new Date(2026, 10, 11, 14, 20).toISOString();
    expect(formatSmart(iso)).toBe("In 20 min");
  });

  it("honours an injected `now`", () => {
    // Rendering a historical booking against the time it was placed, not
    // against real-now — a pattern used by SVC-384's breakdown animation
    // (reveal starts "now", so timings are relative to the open).
    expect(
      formatSmart(new Date(2026, 10, 11, 14, 15), { now: new Date(2026, 10, 11, 14, 0) }),
    ).toBe("In 15 min");
  });
});

describe("formatDaysAgo — review attribution (SVC-388)", () => {
  it("says today for earlier the same day", () => {
    expect(formatDaysAgo(new Date(2026, 10, 11, 8, 0))).toBe("today");
  });

  it("says yesterday for any time the previous calendar day", () => {
    expect(formatDaysAgo(new Date(2026, 10, 10, 23, 30))).toBe("yesterday");
    expect(formatDaysAgo(new Date(2026, 10, 10, 0, 5))).toBe("yesterday");
  });

  it("counts calendar days, not 24h windows", () => {
    // 11 PM two days back is 39h ago — still "2 days ago", not "1 day ago".
    expect(formatDaysAgo(new Date(2026, 10, 9, 23, 0))).toBe("2 days ago");
  });

  it("uses date-fns' wording past a week", () => {
    expect(formatDaysAgo(new Date(2026, 9, 22, 12, 0))).toBe("20 days ago");
    expect(formatDaysAgo(new Date(2026, 8, 1, 12, 0))).toBe("2 months ago");
  });

  it("clamps a future timestamp to today", () => {
    expect(formatDaysAgo(new Date(2026, 10, 11, 18, 0))).toBe("today");
  });

  it("accepts the API's ISO string", () => {
    expect(formatDaysAgo(new Date(2026, 10, 9, 10, 0).toISOString())).toBe("2 days ago");
  });
});
