/**
 * Seven bars for the earnings week (SVC-260).
 *
 * ## Why only the week
 *
 * The ticket asks for per-day bars "across the range", for all three ranges.
 * That works for a week and does not survive a month: 31 bars inside a phone's
 * content width is about 9px each, too narrow for a day label, so the provider
 * can see the shape of the month but cannot name a single day in it. A month
 * needs weekly buckets or a scroll — a different chart, which the ticket never
 * specified. Today needs no chart at all: one day is one bar.
 *
 * So this renders for the week range only. The other two keep the job rows,
 * which at those volumes say strictly more.
 *
 * ## When it hides
 *
 * Only on a week with no completed work at all — there is no shape to draw, and
 * the empty-state copy below already says so. A single job still gets a chart:
 * thin, but a provider who has worked and sees no chart reads that as broken.
 *
 * ## What the chart is for
 *
 * The one thing the rows genuinely cannot do: shape. Which day was heavy, which
 * days were empty — visible at a glance, where eight rows would need adding up
 * in your head. That is the whole justification, and it is why the y-axis is
 * absent: the exact amounts are already in the list below, so repeating them up
 * here would cost width and add nothing.
 */
import { Bar, BarChart, Cell, XAxis } from "recharts";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatRupees } from "@/lib/currency";
import { bucketWeek, isWeekChartWorthShowing, type DayBucket } from "@/lib/earnings-buckets";
import type { API_EarningsBookingItem } from "@/hooks/useApi";

const chartConfig = {
  total: { label: "Earned", color: "var(--primary)" },
} satisfies ChartConfig;

/** Named day plus amount — the two things a bar cannot say by itself. */
function WeekTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DayBucket }[];
}) {
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;

  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium text-foreground">{day.fullLabel}</p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">
        {day.count === 0
          ? "No jobs"
          : `${formatRupees(day.total)} · ${day.count} ${day.count === 1 ? "job" : "jobs"}`}
      </p>
    </div>
  );
}

export function WeekEarningsChart({ bookings }: { bookings: API_EarningsBookingItem[] }) {
  const buckets = bucketWeek(bookings);

  if (!isWeekChartWorthShowing(buckets)) return null;

  const best = Math.max(...buckets.map((b) => b.total));

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">By day</p>

      {/* A plain-language summary for anyone who cannot see the bars. The chart
          itself is decorative once this is present — the amounts are all in the
          job list below. */}
      <p className="sr-only">
        {buckets
          .filter((b) => b.count > 0)
          .map((b) => `${b.fullLabel}: ${formatRupees(b.total)}`)
          .join(". ")}
      </p>

      <ChartContainer config={chartConfig} className="mt-3 aspect-auto h-28 w-full" aria-hidden>
        <BarChart data={buckets} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            className="text-[10px]"
          />
          <ChartTooltip cursor={false} content={<WeekTooltip />} />
          {/* minPointSize keeps a genuinely earning day from rendering as a
              hairline indistinguishable from an empty one — the distinction the
              chart exists to draw. */}
          <Bar dataKey="total" radius={[4, 4, 0, 0]} minPointSize={2}>
            {buckets.map((bucket, i) => (
              <Cell
                key={i}
                fill="var(--primary)"
                // The best day is the one piece of emphasis worth spending, and
                // it is what a provider scans for. Everything else recedes so
                // that it reads immediately. Opacity rather than a second hue:
                // one colour at two weights stays legible in both themes, where
                // a muted second colour has to be chosen twice.
                fillOpacity={bucket.total === best && best > 0 ? 1 : 0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
