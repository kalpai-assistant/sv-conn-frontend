/**
 * The Supply dashboard's charts (SVC-432). Recharts has no heatmap or box plot:
 * the supply gap is a table shaded by token, and the box plot is one ranged bar
 * per category drawn by a custom shape.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import {
  formatDay,
  formatDayYear,
  formatDuration,
  formatPct,
  formatWeek,
  gapShadePct,
  retentionShadePct,
  type AcceptPoint,
  type ActiveWeek,
  type CategoryPrices,
  type ChurnPoint,
  type GapMatrix,
  type SpCohort,
} from "@/lib/analytics";
import { formatRupees, formatRupeesCompact } from "@/lib/money";
import { AXIS, CHART_HEIGHT, COLOR, CURSOR, ChartCard, GRID, LINE_CURSOR, Legend } from "./parts";
import { tooltipFor } from "./tooltip";

// --- Active supply -------------------------------------------------------------

type ActivePoint = ActiveWeek & { label: string };

const activeTooltip = tooltipFor<ActivePoint>((w) => ({
  title: formatWeek(w.week_start),
  rows: [
    { label: "Active SPs", value: String(w.active_sps), color: COLOR.c1 },
    { label: "Active Pros", value: String(w.active_pros), color: COLOR.c2 },
  ],
}));

export function ActiveSupplyChart({ weeks }: { weeks: ActiveWeek[] }) {
  const data: ActivePoint[] = weeks.map((w) => ({ ...w, label: formatDay(w.week_start) }));
  return (
    <ChartCard
      title="Active SPs and Pros by week"
      description="Verified SPs, and active Pros, with at least one booking that week."
      empty={
        weeks.every((w) => w.active_sps === 0 && w.active_pros === 0)
          ? "No SP or Pro had a booking in these weeks."
          : null
      }
      legend={
        <Legend
          entries={[
            { label: "SPs", color: COLOR.c1 },
            { label: "Pros", color: COLOR.c2 },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} minTickGap={8} />
          <YAxis {...AXIS} width={36} allowDecimals={false} />
          <Tooltip content={activeTooltip} cursor={LINE_CURSOR} />
          <Line
            type="monotone"
            dataKey="active_sps"
            name="SPs"
            stroke={COLOR.c1}
            strokeWidth={2}
            dot={{ r: 2.5, fill: COLOR.c1, strokeWidth: 0 }}
          />
          <Line
            type="monotone"
            dataKey="active_pros"
            name="Pros"
            stroke={COLOR.c2}
            strokeWidth={2}
            dot={{ r: 2.5, fill: COLOR.c2, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// --- Time to accept -------------------------------------------------------------

const acceptTooltip = tooltipFor<AcceptPoint>((w) => ({
  title: formatWeek(w.weekStart),
  rows: [
    { label: "p50", value: formatDuration(w.p50), color: COLOR.c1 },
    { label: "p90", value: formatDuration(w.p90), color: COLOR.c3 },
    { label: "Accepted", value: String(w.accepted) },
  ],
}));

export function TimeToAcceptChart({ weeks }: { weeks: AcceptPoint[] }) {
  return (
    <ChartCard
      title="Time to accept"
      description="From booking to the first SP accept, by the week it was booked. Never-accepted bookings are left out; a week with none is a gap."
      empty={
        weeks.every((w) => w.accepted === 0) ? "No booking was accepted in these weeks." : null
      }
      legend={
        <Legend
          entries={[
            { label: "p50 (median)", color: COLOR.c1 },
            { label: "p90", color: COLOR.c3 },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} minTickGap={8} />
          <YAxis {...AXIS} width={64} tickFormatter={(v: number) => formatDuration(v)} />
          <Tooltip content={acceptTooltip} cursor={LINE_CURSOR} />
          <Line
            type="monotone"
            dataKey="p50"
            name="p50"
            stroke={COLOR.c1}
            strokeWidth={2}
            dot={{ r: 2.5, fill: COLOR.c1, strokeWidth: 0 }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="p90"
            name="p90"
            stroke={COLOR.c3}
            strokeWidth={2}
            dot={{ r: 2.5, fill: COLOR.c3, strokeWidth: 0 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// --- Supply-gap heatmap -------------------------------------------------------------

function gapBackground(pct: number): string | undefined {
  return pct > 0 ? `color-mix(in oklab, var(--destructive) ${pct}%, var(--card))` : undefined;
}

export function SupplyGapHeatmap({ matrix }: { matrix: GapMatrix }) {
  const empty = matrix.rows.every((r) => r.cells.every((c) => c === null));
  return (
    <ChartCard
      title="Supply gap by pincode and service"
      description="Each cell is unmet / demand over these weeks: unmet is a booking that expired with no SP accepting. Darker means more of the demand went unmet. A blank cell had no demand."
      empty={empty ? "No bookings in these weeks." : null}
      legend={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            All met
            <span
              aria-hidden
              className="inline-block h-2.5 w-24 rounded-sm border"
              style={{
                background: `linear-gradient(to right, var(--muted), ${gapBackground(gapShadePct(0.01))}, ${gapBackground(gapShadePct(1))})`,
              }}
            />
            All unmet
          </span>
          {matrix.truncationNote && (
            <span className="font-medium text-foreground" data-testid="gap-truncated">
              {matrix.truncationNote}
            </span>
          )}
        </div>
      }
    >
      <table
        className="w-max min-w-full border-separate border-spacing-0.5 text-xs"
        aria-label="Supply gap"
      >
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 bg-card px-2 py-1 text-left font-medium text-muted-foreground"
            >
              Pincode
            </th>
            {matrix.services.map((service) => (
              <th
                key={service.id}
                scope="col"
                className="max-w-28 px-2 py-1 text-center align-bottom font-medium text-muted-foreground"
              >
                {service.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.pincode}>
              <th
                scope="row"
                className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-1 text-left font-normal tabular-nums"
              >
                {row.pincode}
              </th>
              {row.cells.map((cell, index) => {
                const service = matrix.services[index];
                if (!cell) {
                  return (
                    <td
                      key={service.id}
                      className="h-8 min-w-14 rounded-sm"
                      aria-label={`${row.pincode}, ${service.name}: no demand`}
                    />
                  );
                }
                const pct = gapShadePct(cell.share);
                const label = `${row.pincode}, ${service.name}: ${cell.unmet} of ${cell.demand} unmet (${formatPct(cell.share, 0)})`;
                return (
                  <td
                    key={service.id}
                    className={`h-8 min-w-14 rounded-sm px-2 text-center tabular-nums text-foreground ${
                      pct === 0 ? "bg-muted" : ""
                    }`}
                    style={pct > 0 ? { background: gapBackground(pct) } : undefined}
                    title={label}
                    aria-label={label}
                  >
                    {cell.unmet}/{cell.demand}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </ChartCard>
  );
}

// --- New-SP cohorts and churn ------------------------------------------------------

function RateTd({ rate, days }: { rate: number | null; days: number }) {
  const shade = retentionShadePct(rate);
  return (
    <td
      className="px-3 py-2 text-right tabular-nums"
      style={
        shade > 0
          ? { background: `color-mix(in oklab, var(--primary) ${shade}%, var(--card))` }
          : undefined
      }
      title={
        rate === null
          ? `Not every SP in this week is ${days} days past KYC yet.`
          : `${formatPct(rate)} had a booking in the 30 days up to day ${days}.`
      }
    >
      {formatPct(rate)}
    </td>
  );
}

export function SpCohortTable({ cohorts }: { cohorts: SpCohort[] }) {
  return (
    <ChartCard
      title="New-SP retention by KYC week"
      description="Of the SPs verified in a week, the share with a booking in the 30 days up to day 30, 60 and 90. N/A until every SP in the week is that far along."
      empty={cohorts.length === 0 ? "No SP has passed KYC yet." : null}
    >
      <table className="w-full min-w-[26rem] text-sm" aria-label="New-SP retention by KYC week">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              KYC week
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              SPs
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              30 days
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              60 days
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              90 days
            </th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.kyc_week} className="border-b last:border-0">
              <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-normal">
                {formatDayYear(c.kyc_week)}
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{c.size}</td>
              <RateTd rate={c.d30} days={30} />
              <RateTd rate={c.d60} days={60} />
              <RateTd rate={c.d90} days={90} />
            </tr>
          ))}
        </tbody>
      </table>
    </ChartCard>
  );
}

const churnTooltip = tooltipFor<ChurnPoint>((m) => ({
  title: `Signed up ${m.label}`,
  rows: [
    { label: "Verified", value: String(m.verified) },
    { label: "Still booking", value: String(m.retained), color: COLOR.c2 },
    { label: "Churned", value: String(m.churned), color: COLOR.c3 },
    { label: "Churn rate", value: formatPct(m.rate) },
  ],
}));

export function ChurnChart({ months }: { months: ChurnPoint[] }) {
  return (
    <ChartCard
      title="SP churn by signup month"
      description="Verified SPs with no booking in the last 14 days (never booked counts), by the month they signed up."
      empty={months.length === 0 ? "No verified SPs yet." : null}
      minWidth={months.length * 36}
      legend={
        <Legend
          entries={[
            { label: "Still booking", color: COLOR.c2 },
            { label: "Churned", color: COLOR.c3 },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} minTickGap={8} />
          <YAxis {...AXIS} width={36} allowDecimals={false} />
          <Tooltip content={churnTooltip} cursor={CURSOR} />
          <Bar dataKey="retained" name="Still booking" stackId="sp" fill={COLOR.c2} />
          <Bar
            dataKey="churned"
            name="Churned"
            stackId="sp"
            fill={COLOR.c3}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// --- Price box plot ---------------------------------------------------------------

/**
 * Recharts lays out one ranged bar per category, [min, max], and hands this its
 * pixels. Inside them we place p25, median and p75 by linear interpolation: the
 * axis is linear, so that's exactly where the axis would put them.
 */
function BoxShape(props: BarShapeProps) {
  const row = props.payload as CategoryPrices | undefined;
  if (!row) return null;
  const left = Math.min(props.x, props.x + props.width);
  const span = Math.abs(props.width);
  const at = (value: number) =>
    row.max === row.min ? left : left + ((value - row.min) / (row.max - row.min)) * span;
  const mid = props.y + props.height / 2;
  const boxTop = props.y + props.height * 0.15;
  const boxHeight = props.height * 0.7;
  const capTop = props.y + props.height * 0.3;
  const capBottom = props.y + props.height * 0.7;
  return (
    <g data-testid="box">
      <line
        x1={at(row.min)}
        x2={at(row.max)}
        y1={mid}
        y2={mid}
        stroke={COLOR.c1}
        strokeWidth={1.5}
      />
      <line
        x1={at(row.min)}
        x2={at(row.min)}
        y1={capTop}
        y2={capBottom}
        stroke={COLOR.c1}
        strokeWidth={1.5}
      />
      <line
        x1={at(row.max)}
        x2={at(row.max)}
        y1={capTop}
        y2={capBottom}
        stroke={COLOR.c1}
        strokeWidth={1.5}
      />
      <rect
        x={at(row.p25)}
        y={boxTop}
        width={Math.max(1, at(row.p75) - at(row.p25))}
        height={boxHeight}
        rx={2}
        fill="color-mix(in oklab, var(--chart-1) 30%, var(--card))"
        stroke={COLOR.c1}
        strokeWidth={1.5}
      />
      <line
        x1={at(row.median)}
        x2={at(row.median)}
        y1={boxTop}
        y2={boxTop + boxHeight}
        stroke={COLOR.fg}
        strokeWidth={2}
      />
    </g>
  );
}

const priceTooltip = tooltipFor<CategoryPrices>((c) => ({
  title: c.name,
  rows: [
    { label: "Max", value: formatRupees(c.max) },
    { label: "75th percentile", value: formatRupees(c.p75) },
    { label: "Median", value: formatRupees(c.median) },
    { label: "25th percentile", value: formatRupees(c.p25) },
    { label: "Min", value: formatRupees(c.min) },
    { label: "Items", value: String(c.count) },
  ],
}));

export function PriceBoxPlot({ prices }: { prices: CategoryPrices[] }) {
  return (
    <ChartCard
      title="Price distribution by category"
      description="Unit prices on completed bookings, all time. The whiskers are min and max, the box is the middle half, and the line is the median."
      empty={prices.length === 0 ? "No completed bookings yet." : null}
      minWidth={320}
    >
      <ResponsiveContainer width="100%" height={48 + prices.length * 40}>
        <BarChart
          data={prices}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
          barCategoryGap={8}
        >
          <CartesianGrid {...GRID} vertical horizontal={false} />
          <XAxis
            type="number"
            {...AXIS}
            domain={[0, "dataMax"]}
            tickFormatter={formatRupeesCompact}
          />
          <YAxis type="category" dataKey="name" {...AXIS} width={140} />
          <Tooltip content={priceTooltip} cursor={CURSOR} />
          <Bar
            dataKey={(row: CategoryPrices) => [row.min, row.max]}
            name="Price"
            shape={BoxShape}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
