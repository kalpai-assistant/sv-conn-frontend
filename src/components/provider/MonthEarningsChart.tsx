/**
 * A bar per day of the month, on the Earnings tab (SVC-260).
 *
 * ## The problem this shape has, and how it is answered
 *
 * 31 bars inside a phone's content width is about 9px each, so no day label
 * fits under them. Left there, a provider sees a tall bar and has no way to
 * learn which day it was — the chart shows the month's shape and withholds the
 * one thing you would want after noticing it.
 *
 * So the axis carries only its endpoints (1st, mid, last) to anchor the span,
 * and **tapping a bar names that day and its total**. The detail the width
 * cannot print is one tap away instead of absent.
 *
 * The tap is a pointer affordance and nothing more: the chart stays
 * `aria-hidden`, and the `sr-only` summary below carries every earning day and
 * its total outright. A screen-reader user gets the figures without hunting
 * through 31 focus stops for the two days that have any — which is a better
 * answer here than making each bar focusable.
 *
 * ## Why not weekly buckets
 *
 * Four wide bars would label cleanly, and would stop being the per-day chart
 * the ticket asks for. Daily-with-tap keeps the spec and answers the
 * readability problem; weekly would answer it by changing the question.
 */
import { useState } from "react";
import { Bar, BarChart, Cell } from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatRupees } from "@/i18n/format";
import { useT } from "@/i18n/LanguageProvider";
import { bucketMonth, isMonthChartWorthShowing, type MonthDayBucket } from "@/lib/earnings-buckets";
import type { API_EarningsBookingItem } from "@/hooks/useApi";

const chartConfig = {
  total: { label: "Earned", color: "var(--primary)" },
} satisfies ChartConfig;

export function MonthEarningsChart({ bookings }: { bookings: API_EarningsBookingItem[] }) {
  // Which bar the provider tapped. Null is the resting state — the readout
  // then names the best day, so the strip is never blank and the tallest bar
  // is explained without needing a tap at all.
  const [selected, setSelected] = useState<number | null>(null);
  const { t, lang } = useT("provider");

  const buckets = bucketMonth(bookings, undefined, lang);

  if (!isMonthChartWorthShowing(buckets)) return null;

  const best = Math.max(...buckets.map((b) => b.total));
  const bestDay = buckets.find((b) => b.total === best && best > 0);
  const shown: MonthDayBucket | undefined = selected !== null ? buckets[selected] : bestDay;

  const lastDay = buckets[buckets.length - 1].day;
  const midDay = Math.ceil(lastDay / 2);
  // "1 Sep" — the first day's own label, so it is in the screen's language.
  const firstLabel = buckets[0].fullLabel;

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("chart.byDay")}
        </p>
        {/* The readout, where a 9px bar cannot carry its own label. Shows the
            best day until one is tapped, so it is informative at rest. */}
        {shown && (
          <p className="truncate text-xs tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">{shown.fullLabel}</span>
            {shown.count > 0 ? ` · ${formatRupees(shown.total, lang)}` : t("chart.noJobsInline")}
          </p>
        )}
      </div>

      {/* The amounts, for anyone who cannot see or tap the bars. */}
      <p className="sr-only">
        {buckets
          .filter((b) => b.count > 0)
          .map((b) => `${b.fullLabel}: ${formatRupees(b.total, lang)}`)
          .join(". ")}
      </p>

      <ChartContainer config={chartConfig} className="mt-3 aspect-auto h-24 w-full" aria-hidden>
        <BarChart
          data={buckets}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          barCategoryGap={1}
        >
          {/* No <XAxis>: at this width recharts would drop most ticks and leave
              an arbitrary scatter of dates. The endpoint strip below is drawn
              by hand instead, so which three dates appear is a decision rather
              than a side effect of tick collision. */}
          <Bar
            dataKey="total"
            radius={[2, 2, 0, 0]}
            minPointSize={2}
            onClick={(_, index) => setSelected((prev) => (prev === index ? null : index))}
          >
            {buckets.map((bucket, i) => (
              <Cell
                key={i}
                fill="var(--primary)"
                // Emphasis follows the tap; with none, it rests on the best day
                // so the readout above always has a bar to point at.
                fillOpacity={
                  (selected !== null ? i === selected : bucket.total === best && best > 0)
                    ? 1
                    : 0.35
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>

      {/* Endpoints only. Three dates anchor the span; the rest come from tapping. */}
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{firstLabel}</span>
        <span>{midDay}</span>
        <span>{lastDay}</span>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">{t("chart.tapHint")}</p>
    </div>
  );
}
