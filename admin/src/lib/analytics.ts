/**
 * The Overview and Supply dashboards (SVC-432): the API's shapes, and the pure
 * mapping from them to what a chart or table draws.
 *
 * The types are hand-copied from the backend's app/analytics/schemas.py, and the
 * definitions behind each number are in its ADMIN.md "Analytics (SVC-432)". Money
 * is rupees, ratios are 0..1, week_start is an IST Monday, and null means "not
 * enough history". Null is never drawn as 0: it's "N/A" in text and a gap in a
 * line. The series come dense from the backend (every day, every week), so the
 * mappers here never fill or drop a row, and a 0 is a real zero.
 */

// --- API shapes ------------------------------------------------------------

export interface GmvWindow {
  days: number;
  gmv: number;
  completed: number;
  previous_gmv: number | null;
  /** (gmv - previous) / previous, as a ratio; null when previous is null or 0. */
  change_pct: number | null;
}

export interface OverviewWeek {
  week_start: string;
  gmv: number;
  completed: number;
  commission: number;
  take_rate: number | null;
  aov: number | null;
}

export interface BookingsDay {
  day: string;
  requested: number;
  accepted: number;
  en_route: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  expired: number;
  /** Not a status: overlaps the others. */
  refunded: number;
}

export interface RetentionCell {
  matured: number;
  rebooked: number;
  rate: number | null;
}

export interface ConsumerCohort {
  signup_week: string;
  size: number;
  d7: RetentionCell;
  d30: RetentionCell;
  d90: RetentionCell;
}

export interface OverviewResponse {
  as_of: string;
  gmv: GmvWindow[];
  weekly: OverviewWeek[];
  daily: BookingsDay[];
  cohorts: ConsumerCohort[];
}

export interface ActiveWeek {
  week_start: string;
  active_sps: number;
  active_pros: number;
}

export interface ActiveSupply {
  sps_7d: number;
  sps_30d: number;
  pros_7d: number;
  pros_30d: number;
  weekly: ActiveWeek[];
}

export interface SpCohort {
  kyc_week: string;
  size: number;
  d30: number | null;
  d60: number | null;
  d90: number | null;
}

export interface ChurnMonth {
  /** "YYYY-MM", IST. */
  signup_month: string;
  verified: number;
  churned: number;
  rate: number;
}

export interface GapService {
  id: string;
  name: string;
}

export interface GapCell {
  pincode: string;
  service_id: string;
  demand: number;
  unmet: number;
}

export interface SupplyGap {
  /** By demand, highest first; "Unknown" is always kept. */
  pincodes: string[];
  services: GapService[];
  cells: GapCell[];
  truncated: boolean;
  total_pincodes: number;
}

export interface CategoryPrices {
  category_id: string;
  name: string;
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
}

export interface AcceptWeek {
  week_start: string;
  accepted: number;
  p50_seconds: number | null;
  p90_seconds: number | null;
}

export interface SupplyResponse {
  as_of: string;
  active: ActiveSupply;
  sp_cohorts: SpCohort[];
  churn: ChurnMonth[];
  supply_gap: SupplyGap;
  prices: CategoryPrices[];
  time_to_accept: AcceptWeek[];
}

// --- The weeks selector ------------------------------------------------------

export const WEEK_OPTIONS = [4, 12, 26, 52] as const;
export type WeeksOption = (typeof WEEK_OPTIONS)[number];
export const DEFAULT_WEEKS: WeeksOption = 12;

export interface AnalyticsSearch {
  /** Absent means the default, so the plain URL stays plain. */
  weeks?: WeeksOption;
}

/** ?weeks= from the URL. Anything but a listed option is the default. */
export function validateAnalyticsSearch(raw: Record<string, unknown>): AnalyticsSearch {
  const weeks = Number(raw.weeks);
  return WEEK_OPTIONS.includes(weeks as WeeksOption) && weeks !== DEFAULT_WEEKS
    ? { weeks: weeks as WeeksOption }
    : {};
}

export function overviewPath(weeks: WeeksOption): string {
  return `/admin/analytics/overview?weeks=${weeks}`;
}

export function supplyPath(weeks: WeeksOption): string {
  return `/admin/analytics/supply?weeks=${weeks}`;
}

// --- Text --------------------------------------------------------------------

export const NOT_AVAILABLE = "N/A";

/** A 0..1 ratio as a percentage. Null is "N/A", never 0%. */
export function formatPct(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return NOT_AVAILABLE;
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** A change ratio with its sign: +12.5%, −4.0%, 0.0%. Null is "N/A". */
export function formatChange(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return NOT_AVAILABLE;
  const pct = (Math.abs(ratio) * 100).toFixed(1);
  if (pct === "0.0") return "0.0%";
  return `${ratio > 0 ? "+" : "−"}${pct}%`;
}

/**
 * Seconds as a person says them: "45 s", "12 min", "1 h 20 min", "2 d 3 h".
 * Two units at most, rounded at the smaller one. Null is "N/A".
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return NOT_AVAILABLE;
  }
  if (seconds < 59.5) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(seconds / 3600);
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h === 0 ? `${d} d` : `${d} d ${h} h`;
}

const AS_OF = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** When the views last refreshed, in IST: "11 Nov 2026, 3:45 pm IST". */
export function formatAsOf(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${AS_OF.format(date)} IST`;
}

// A yyyy-mm-dd is a calendar day, not an instant: read it as UTC and print it in
// UTC, so no zone shifts it a day.
const DAY_MONTH = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const MONTH_YEAR = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});

function utcDay(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** "3 Nov" for a day or week start. */
export function formatDay(iso: string): string {
  const date = utcDay(iso);
  return date ? DAY_MONTH.format(date) : iso;
}

/** "3 Nov 2026", where the year matters (cohort rows, tooltips). */
export function formatDayYear(iso: string): string {
  const date = utcDay(iso);
  return date ? DAY_MONTH_YEAR.format(date) : iso;
}

/** "Week of 3 Nov 2026". */
export function formatWeek(iso: string): string {
  return `Week of ${formatDayYear(iso)}`;
}

/** "2026-05" → "May 2026". */
export function formatMonth(yyyyMm: string): string {
  const date = utcDay(`${yyyyMm}-01`);
  return date ? MONTH_YEAR.format(date) : yyyyMm;
}

// --- Overview mapping --------------------------------------------------------

export interface GmvTile {
  label: string;
  gmv: number;
  completed: number;
  change: string;
  /** For the arrow and colour: null when the change is N/A or flat. */
  direction: "up" | "down" | null;
  previousGmv: number | null;
}

export function toGmvTiles(windows: GmvWindow[]): GmvTile[] {
  return [...windows]
    .sort((a, b) => a.days - b.days)
    .map((w) => ({
      label: `Last ${w.days} days`,
      gmv: w.gmv,
      completed: w.completed,
      change: formatChange(w.change_pct),
      direction:
        w.change_pct === null || formatChange(w.change_pct) === "0.0%"
          ? null
          : w.change_pct > 0
            ? "up"
            : "down",
      previousGmv: w.previous_gmv,
    }));
}

export interface WeekPoint {
  weekStart: string;
  label: string;
  gmv: number;
  completed: number;
  /** Percent (0..100) for the axis; null stays null so the line breaks. */
  takeRatePct: number | null;
  aov: number | null;
}

export function toWeeklySeries(weeks: OverviewWeek[]): WeekPoint[] {
  return weeks.map((w) => ({
    weekStart: w.week_start,
    label: formatDay(w.week_start),
    gmv: w.gmv,
    completed: w.completed,
    takeRatePct: w.take_rate === null ? null : w.take_rate * 100,
    aov: w.aov,
  }));
}

export interface DayPoint {
  day: string;
  label: string;
  /** requested + accepted + en_route + in_progress: still going. */
  open: number;
  completed: number;
  cancelled: number;
  expired: number;
  refunded: number;
  total: number;
  raw: BookingsDay;
}

/** One point per day the API sent, in its order. Nothing is filled or dropped. */
export function toDailySeries(days: BookingsDay[]): DayPoint[] {
  return days.map((d) => {
    const open = d.requested + d.accepted + d.en_route + d.in_progress;
    return {
      day: d.day,
      label: formatDay(d.day),
      open,
      completed: d.completed,
      cancelled: d.cancelled,
      expired: d.expired,
      refunded: d.refunded,
      total: open + d.completed + d.cancelled + d.expired,
      raw: d,
    };
  });
}

/**
 * Which days get an x-axis label. Up to 26 weeks that's each Monday (or the first
 * day if the range starts mid-week); at 52, the first of each month. One label
 * per day would overprint at any width.
 */
export function dailyTicks(days: string[], weeks: number): string[] {
  if (days.length === 0) return [];
  const ticks = days.filter((iso, index) => {
    const date = utcDay(iso);
    if (!date) return false;
    if (weeks >= 52) return date.getUTCDate() === 1;
    return date.getUTCDay() === 1 || index === 0;
  });
  return ticks.length > 0 ? ticks : [days[0]];
}

/** Bars below this get unreadable, so a long range scrolls inside its card. */
export const MIN_DAY_BAR_PX = 5;

export function dailyChartMinWidth(dayCount: number): number {
  return dayCount * MIN_DAY_BAR_PX;
}

export function isOverviewEmpty(data: OverviewResponse): boolean {
  return (
    data.gmv.every((w) => w.gmv === 0 && w.completed === 0) &&
    data.weekly.every((w) => w.completed === 0) &&
    toDailySeries(data.daily).every((d) => d.total === 0 && d.refunded === 0) &&
    data.cohorts.length === 0
  );
}

// --- Supply mapping ----------------------------------------------------------

export interface ChurnPoint {
  month: string;
  label: string;
  retained: number;
  churned: number;
  verified: number;
  rate: number;
}

export function toChurnSeries(months: ChurnMonth[]): ChurnPoint[] {
  return months.map((m) => ({
    month: m.signup_month,
    label: formatMonth(m.signup_month),
    retained: Math.max(0, m.verified - m.churned),
    churned: m.churned,
    verified: m.verified,
    rate: m.rate,
  }));
}

export interface AcceptPoint {
  weekStart: string;
  label: string;
  accepted: number;
  p50: number | null;
  p90: number | null;
}

export function toAcceptSeries(weeks: AcceptWeek[]): AcceptPoint[] {
  return weeks.map((w) => ({
    weekStart: w.week_start,
    label: formatDay(w.week_start),
    accepted: w.accepted,
    p50: w.p50_seconds,
    p90: w.p90_seconds,
  }));
}

export interface GapMatrixCell {
  demand: number;
  unmet: number;
  /** unmet / demand, 0..1. */
  share: number;
}

export interface GapMatrixRow {
  pincode: string;
  /** One per service, in the services' order. Null is no demand: a blank cell. */
  cells: (GapMatrixCell | null)[];
}

export interface GapMatrix {
  services: GapService[];
  rows: GapMatrixRow[];
  /** "Top 30 of 41 pincodes" when the backend cut the list, else null. */
  truncationNote: string | null;
}

export function toGapMatrix(gap: SupplyGap): GapMatrix {
  const byKey = new Map(gap.cells.map((c) => [`${c.pincode}|${c.service_id}`, c]));
  return {
    services: gap.services,
    rows: gap.pincodes.map((pincode) => ({
      pincode,
      cells: gap.services.map((service) => {
        const cell = byKey.get(`${pincode}|${service.id}`);
        if (!cell || cell.demand <= 0) return null;
        return { demand: cell.demand, unmet: cell.unmet, share: cell.unmet / cell.demand };
      }),
    })),
    truncationNote: gap.truncated
      ? `Top ${gap.pincodes.length} of ${gap.total_pincodes} pincodes`
      : null,
  };
}

/**
 * How much of --destructive to mix into the card for a cell: a little even for
 * a small share, so any unmet demand shows, and capped so text stays legible.
 * A cell with demand but nothing unmet takes no red. Mixing in oklab moves
 * lightness linearly, so at 80% the light-mode cell is still light enough for
 * the dark foreground, and the dark-mode one dark enough for the light one.
 */
export function gapShadePct(share: number): number {
  if (share <= 0) return 0;
  return Math.round(15 + Math.min(1, share) * 65);
}

/** How much --primary to mix into a retention cell: 0..40%, so the grey subtitle stays legible. */
export function retentionShadePct(rate: number | null): number {
  if (rate === null || !Number.isFinite(rate)) return 0;
  return Math.round(Math.max(0, Math.min(1, rate)) * 40);
}

export function isSupplyEmpty(data: SupplyResponse): boolean {
  const a = data.active;
  return (
    a.sps_30d === 0 &&
    a.pros_30d === 0 &&
    a.weekly.every((w) => w.active_sps === 0 && w.active_pros === 0) &&
    data.sp_cohorts.length === 0 &&
    data.churn.length === 0 &&
    data.supply_gap.cells.length === 0 &&
    data.prices.length === 0 &&
    data.time_to_accept.every((w) => w.accepted === 0)
  );
}
