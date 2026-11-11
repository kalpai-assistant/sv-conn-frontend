/**
 * The Overview dashboard's charts (SVC-432). Each takes the mapped series from
 * lib/analytics.ts. A null week is a gap in a line, never a dip to 0.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  dailyChartMinWidth,
  dailyTicks,
  formatDay,
  formatDayYear,
  formatPct,
  formatWeek,
  retentionShadePct,
  type ConsumerCohort,
  type DayPoint,
  type RetentionCell,
  type WeekPoint,
} from "@/lib/analytics";
import { formatRupees, formatRupeesCompact } from "@/lib/money";
import { AXIS, CHART_HEIGHT, COLOR, CURSOR, ChartCard, GRID, LINE_CURSOR, Legend } from "./parts";
import { tooltipFor } from "./tooltip";

const weekTooltip = tooltipFor<WeekPoint>((w) => ({
  title: formatWeek(w.weekStart),
  rows: [
    { label: "GMV", value: formatRupees(w.gmv), color: COLOR.c1 },
    { label: "Completed", value: String(w.completed) },
    {
      label: "Take rate",
      value: w.takeRatePct === null ? "N/A" : `${w.takeRatePct.toFixed(1)}%`,
    },
    { label: "AOV", value: w.aov === null ? "N/A" : formatRupees(w.aov) },
  ],
}));

export function WeeklyGmvChart({ weeks }: { weeks: WeekPoint[] }) {
  return (
    <ChartCard
      title="Weekly GMV"
      description="Completed bookings' service amount, before discount and without tips."
      empty={weeks.every((w) => w.completed === 0) ? "No completed bookings in these weeks." : null}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} minTickGap={8} />
          <YAxis {...AXIS} width={56} tickFormatter={formatRupeesCompact} />
          <Tooltip content={weekTooltip} cursor={CURSOR} />
          <Bar dataKey="gmv" name="GMV" fill={COLOR.c1} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function WeeklyLine({
  weeks,
  title,
  description,
  dataKey,
  color,
  tickFormatter,
}: {
  weeks: WeekPoint[];
  title: string;
  description: string;
  dataKey: "takeRatePct" | "aov";
  color: string;
  tickFormatter: (value: number) => string;
}) {
  return (
    <ChartCard
      title={title}
      description={description}
      empty={
        weeks.every((w) => w[dataKey] === null) ? "No completed bookings in these weeks." : null
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} minTickGap={8} />
          <YAxis {...AXIS} width={56} tickFormatter={tickFormatter} />
          <Tooltip content={weekTooltip} cursor={LINE_CURSOR} />
          <Line
            type="monotone"
            dataKey={dataKey}
            name={title}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function TakeRateChart({ weeks }: { weeks: WeekPoint[] }) {
  return (
    <WeeklyLine
      weeks={weeks}
      title="Take rate"
      description="Platform commission as a share of GMV, by week. A week with no sale is a gap."
      dataKey="takeRatePct"
      color={COLOR.c2}
      tickFormatter={(v) => `${v}%`}
    />
  );
}

export function AovChart({ weeks }: { weeks: WeekPoint[] }) {
  return (
    <WeeklyLine
      weeks={weeks}
      title="Average order value"
      description="GMV per completed booking, by week. A week with no sale is a gap."
      dataKey="aov"
      color={COLOR.c3}
      tickFormatter={formatRupeesCompact}
    />
  );
}

const DAILY_SERIES = [
  { key: "open", label: "Open", color: COLOR.c1 },
  { key: "completed", label: "Completed", color: COLOR.c2 },
  { key: "cancelled", label: "Cancelled", color: COLOR.c3 },
  { key: "expired", label: "Expired", color: COLOR.muted },
] as const;

const dayTooltip = tooltipFor<DayPoint>((d) => ({
  title: formatDayYear(d.day),
  rows: [
    { label: "Requested", value: String(d.raw.requested), color: COLOR.c1 },
    { label: "Accepted", value: String(d.raw.accepted), color: COLOR.c1 },
    { label: "En route", value: String(d.raw.en_route), color: COLOR.c1 },
    { label: "In progress", value: String(d.raw.in_progress), color: COLOR.c1 },
    { label: "Completed", value: String(d.completed), color: COLOR.c2 },
    { label: "Cancelled", value: String(d.cancelled), color: COLOR.c3 },
    { label: "Expired", value: String(d.expired), color: COLOR.muted },
    { label: "Refunded", value: String(d.refunded), color: COLOR.fg },
  ],
}));

export function BookingsPerDayChart({ days, weeks }: { days: DayPoint[]; weeks: number }) {
  const ticks = dailyTicks(
    days.map((d) => d.day),
    weeks,
  );
  return (
    <ChartCard
      title="Bookings per day"
      description="By each booking's current status, on the day it was created. Open is requested, accepted, en route or in progress. Refunded isn't a status: it overlaps the others."
      empty={
        days.every((d) => d.total === 0 && d.refunded === 0) ? "No bookings in these weeks." : null
      }
      minWidth={dailyChartMinWidth(days.length)}
      legend={
        <Legend
          entries={[
            ...DAILY_SERIES.map((s) => ({ label: s.label, color: s.color })),
            { label: "Refunded", color: COLOR.fg, dashed: true },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT + 20}>
        <ComposedChart
          data={days}
          barCategoryGap={days.length > 120 ? 0 : 1}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid {...GRID} />
          <XAxis
            dataKey="day"
            {...AXIS}
            ticks={ticks}
            tickFormatter={formatDay}
            interval="preserveStartEnd"
            minTickGap={6}
          />
          <YAxis {...AXIS} width={36} allowDecimals={false} />
          <Tooltip content={dayTooltip} cursor={CURSOR} />
          {DAILY_SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="status"
              fill={s.color}
              isAnimationActive={false}
            />
          ))}
          <Line
            type="monotone"
            dataKey="refunded"
            name="Refunded"
            stroke={COLOR.fg}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function RetentionTd({ cell, days }: { cell: RetentionCell; days: number }) {
  const shade = retentionShadePct(cell.rate);
  const detail =
    cell.matured === 0
      ? `No member is ${days} days past their first completed booking yet.`
      : `${cell.rebooked} of ${cell.matured} rebooked within ${days} days.`;
  return (
    <td
      className="px-3 py-2 text-right align-top"
      style={
        shade > 0
          ? { background: `color-mix(in oklab, var(--primary) ${shade}%, var(--card))` }
          : undefined
      }
      title={detail}
    >
      <div className="font-medium tabular-nums">{formatPct(cell.rate)}</div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {cell.matured === 0 ? "not matured" : `${cell.rebooked}/${cell.matured}`}
      </div>
    </td>
  );
}

export function ConsumerCohortTable({ cohorts }: { cohorts: ConsumerCohort[] }) {
  return (
    <ChartCard
      title="Consumer retention by signup week"
      description="Of the consumers who completed a booking, how many booked again within 7, 30 and 90 days of their first. Under each rate: rebooked / members whose window has passed. N/A means none has yet."
      empty={cohorts.length === 0 ? "No consumer has completed a booking yet." : null}
    >
      <table
        className="w-full min-w-[30rem] text-sm"
        aria-label="Consumer retention by signup week"
      >
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              Signup week
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Members
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              7 days
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              30 days
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              90 days
            </th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.signup_week} className="border-b last:border-0">
              <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-normal">
                {formatDayYear(c.signup_week)}
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{c.size}</td>
              <RetentionTd cell={c.d7} days={7} />
              <RetentionTd cell={c.d30} days={30} />
              <RetentionTd cell={c.d90} days={90} />
            </tr>
          ))}
        </tbody>
      </table>
    </ChartCard>
  );
}

export function MarketplaceHealthCard() {
  return (
    <ChartCard
      title="Marketplace health"
      description="SPs shown per sheet, pick rank, price change at checkout and boosted-SP share."
    >
      <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        Not tracked yet. These need the marketplace events from SVC-419, so there's nothing to show
        until they ship.
      </p>
    </ChartCard>
  );
}
