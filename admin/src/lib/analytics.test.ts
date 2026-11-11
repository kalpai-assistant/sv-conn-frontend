import { describe, expect, it } from "vitest";
import {
  dailyChartMinWidth,
  dailyTicks,
  formatAsOf,
  formatChange,
  formatDay,
  formatDuration,
  formatMonth,
  formatPct,
  gapShadePct,
  isOverviewEmpty,
  isSupplyEmpty,
  retentionShadePct,
  toAcceptSeries,
  toChurnSeries,
  toDailySeries,
  toGapMatrix,
  toGmvTiles,
  toWeeklySeries,
  validateAnalyticsSearch,
  type BookingsDay,
  type OverviewResponse,
  type SupplyResponse,
} from "@/lib/analytics";

function day(dayIso: string, overrides: Partial<BookingsDay> = {}): BookingsDay {
  return {
    day: dayIso,
    requested: 0,
    accepted: 0,
    en_route: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    expired: 0,
    refunded: 0,
    ...overrides,
  };
}

describe("null is N/A, never zero", () => {
  it("formats a ratio, and null or NaN as N/A", () => {
    expect(formatPct(0.1234)).toBe("12.3%");
    expect(formatPct(0)).toBe("0.0%");
    expect(formatPct(1, 0)).toBe("100%");
    expect(formatPct(null)).toBe("N/A");
    expect(formatPct(undefined)).toBe("N/A");
    expect(formatPct(Number.NaN)).toBe("N/A");
  });

  it("signs a change, and leaves a null change as N/A", () => {
    expect(formatChange(0.125)).toBe("+12.5%");
    expect(formatChange(-0.04)).toBe("−4.0%");
    expect(formatChange(0)).toBe("0.0%");
    expect(formatChange(0.00001)).toBe("0.0%");
    expect(formatChange(null)).toBe("N/A");
  });

  it("gives GMV tiles in window order, with no direction when the change is N/A", () => {
    const tiles = toGmvTiles([
      { days: 90, gmv: 9000, completed: 30, previous_gmv: null, change_pct: null },
      { days: 7, gmv: 1000, completed: 4, previous_gmv: 800, change_pct: 0.25 },
      { days: 30, gmv: 3000, completed: 12, previous_gmv: 4000, change_pct: -0.25 },
    ]);
    expect(tiles.map((t) => t.label)).toEqual(["Last 7 days", "Last 30 days", "Last 90 days"]);
    expect(tiles.map((t) => [t.change, t.direction])).toEqual([
      ["+25.0%", "up"],
      ["−25.0%", "down"],
      ["N/A", null],
    ]);
  });

  it("keeps a week with no completed booking as a gap in take rate and AOV", () => {
    const [empty, sold] = toWeeklySeries([
      { week_start: "2026-11-02", gmv: 0, completed: 0, commission: 0, take_rate: null, aov: null },
      {
        week_start: "2026-11-09",
        gmv: 2000,
        completed: 2,
        commission: 300,
        take_rate: 0.15,
        aov: 1000,
      },
    ]);
    expect(empty).toMatchObject({ gmv: 0, takeRatePct: null, aov: null, label: "2 Nov" });
    expect(sold.takeRatePct).toBeCloseTo(15);
    expect(sold.aov).toBe(1000);
  });

  it("keeps a null p50/p90 as null", () => {
    expect(
      toAcceptSeries([
        { week_start: "2026-11-02", accepted: 0, p50_seconds: null, p90_seconds: null },
      ])[0],
    ).toMatchObject({ p50: null, p90: null, accepted: 0 });
  });
});

describe("seconds as readable time", () => {
  it.each([
    [0, "0 s"],
    [45, "45 s"],
    [59.4, "59 s"],
    [59.6, "1 min"],
    [90, "2 min"],
    [12 * 60, "12 min"],
    [3600, "1 h"],
    [80 * 60, "1 h 20 min"],
    [23 * 3600 + 59 * 60, "23 h 59 min"],
    [86_399, "1 d"],
    [2 * 86_400 + 3 * 3600, "2 d 3 h"],
    [3 * 86_400, "3 d"],
  ])("%s s → %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });

  it("says N/A for null, negative or non-finite", () => {
    expect(formatDuration(null)).toBe("N/A");
    expect(formatDuration(-1)).toBe("N/A");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("N/A");
  });
});

describe("dates", () => {
  it("prints as_of in IST", () => {
    expect(formatAsOf("2026-11-11T10:15:00Z")).toBe("11 Nov 2026, 3:45 pm IST");
  });

  it("never shifts a calendar day by zone", () => {
    expect(formatDay("2026-11-02")).toBe("2 Nov");
    expect(formatMonth("2026-05")).toBe("May 2026");
  });
});

describe("toDailySeries", () => {
  it("maps each day the API sent, in order, keeping a zero day as 0", () => {
    const series = toDailySeries([
      day("2026-11-09", { requested: 1, accepted: 2, en_route: 1, in_progress: 1, completed: 3 }),
      day("2026-11-10"),
      day("2026-11-11", { cancelled: 2, expired: 1, refunded: 1 }),
    ]);
    expect(series.map((d) => d.day)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(series[0]).toMatchObject({ open: 5, completed: 3, total: 8 });
    expect(series[1]).toMatchObject({
      open: 0,
      completed: 0,
      cancelled: 0,
      expired: 0,
      refunded: 0,
      total: 0,
    });
    // Refunded overlaps the statuses, so it isn't in the total.
    expect(series[2]).toMatchObject({ cancelled: 2, expired: 1, refunded: 1, total: 3 });
  });

  it("labels Mondays up to 26 weeks, and the 1st of each month at 52", () => {
    const days = ["2026-10-29", "2026-10-30", "2026-11-01", "2026-11-02", "2026-11-09"];
    expect(dailyTicks(days, 12)).toEqual(["2026-10-29", "2026-11-02", "2026-11-09"]);
    expect(dailyTicks(days, 52)).toEqual(["2026-11-01"]);
    expect(dailyTicks(["2026-11-03"], 52)).toEqual(["2026-11-03"]);
    expect(dailyTicks([], 4)).toEqual([]);
  });

  it("gives a long range a minimum width, so it scrolls instead of squashing", () => {
    expect(dailyChartMinWidth(364)).toBeGreaterThan(1500);
    expect(dailyChartMinWidth(28)).toBeLessThan(375);
  });
});

describe("toGapMatrix", () => {
  const gap = {
    pincodes: ["560001", "Unknown"],
    services: [
      { id: "s1", name: "Cleaning" },
      { id: "s2", name: "Plumbing" },
    ],
    cells: [
      { pincode: "560001", service_id: "s1", demand: 4, unmet: 1 },
      { pincode: "Unknown", service_id: "s2", demand: 2, unmet: 2 },
      { pincode: "560001", service_id: "s2", demand: 0, unmet: 0 },
    ],
    truncated: false,
    total_pincodes: 2,
  };

  it("puts each cell under its pincode and service; no demand is a blank cell", () => {
    const matrix = toGapMatrix(gap);
    expect(matrix.rows.map((r) => r.pincode)).toEqual(["560001", "Unknown"]);
    expect(matrix.rows[0].cells).toEqual([{ demand: 4, unmet: 1, share: 0.25 }, null]);
    expect(matrix.rows[1].cells).toEqual([null, { demand: 2, unmet: 2, share: 1 }]);
    expect(matrix.truncationNote).toBeNull();
  });

  it("says what was cut", () => {
    expect(toGapMatrix({ ...gap, truncated: true, total_pincodes: 41 }).truncationNote).toBe(
      "Top 2 of 41 pincodes",
    );
  });

  it("shades by unmet share, with none for fully met demand", () => {
    expect(gapShadePct(0)).toBe(0);
    expect(gapShadePct(0.01)).toBeGreaterThan(10);
    expect(gapShadePct(1)).toBe(80);
    expect(retentionShadePct(null)).toBe(0);
    expect(retentionShadePct(1)).toBe(40);
  });
});

describe("toChurnSeries", () => {
  it("splits verified into retained and churned", () => {
    expect(
      toChurnSeries([{ signup_month: "2026-06", verified: 10, churned: 4, rate: 0.4 }])[0],
    ).toMatchObject({ label: "Jun 2026", retained: 6, churned: 4, rate: 0.4 });
  });
});

describe("empty", () => {
  const overview: OverviewResponse = {
    as_of: "2026-11-11T10:15:00Z",
    gmv: [{ days: 7, gmv: 0, completed: 0, previous_gmv: null, change_pct: null }],
    weekly: [
      { week_start: "2026-11-09", gmv: 0, completed: 0, commission: 0, take_rate: null, aov: null },
    ],
    daily: [day("2026-11-10"), day("2026-11-11")],
    cohorts: [],
  };
  const supply: SupplyResponse = {
    as_of: "2026-11-11T10:15:00Z",
    active: {
      sps_7d: 0,
      sps_30d: 0,
      pros_7d: 0,
      pros_30d: 0,
      weekly: [{ week_start: "2026-11-09", active_sps: 0, active_pros: 0 }],
    },
    sp_cohorts: [],
    churn: [],
    supply_gap: { pincodes: [], services: [], cells: [], truncated: false, total_pincodes: 0 },
    prices: [],
    time_to_accept: [
      { week_start: "2026-11-09", accepted: 0, p50_seconds: null, p90_seconds: null },
    ],
  };

  it("calls a fresh DB empty, and one booking not", () => {
    expect(isOverviewEmpty(overview)).toBe(true);
    expect(isOverviewEmpty({ ...overview, daily: [day("2026-11-10", { requested: 1 })] })).toBe(
      false,
    );
    expect(isSupplyEmpty(supply)).toBe(true);
    expect(
      isSupplyEmpty({
        ...supply,
        churn: [{ signup_month: "2026-06", verified: 1, churned: 1, rate: 1 }],
      }),
    ).toBe(false);
  });
});

describe("validateAnalyticsSearch", () => {
  it("keeps a listed week count and drops the default or anything else", () => {
    expect(validateAnalyticsSearch({ weeks: 26 })).toEqual({ weeks: 26 });
    expect(validateAnalyticsSearch({ weeks: "52" })).toEqual({ weeks: 52 });
    expect(validateAnalyticsSearch({ weeks: 12 })).toEqual({});
    expect(validateAnalyticsSearch({ weeks: 7 })).toEqual({});
    expect(validateAnalyticsSearch({})).toEqual({});
  });
});
