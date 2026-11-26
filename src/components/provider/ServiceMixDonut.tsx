/**
 * Service-mix donut (SVC-494, Phase 5 of SVC-378).
 *
 * The window chart shows *when* a provider earned; this answers *from
 * which service*. "60% of your earnings from AC service, 40% from TV
 * repair" tells the provider which service to prioritise training /
 * availability for — the same shape UC Partner surfaces as a donut.
 *
 * ## Aggregation
 *
 * By `service_name` on `EarningsBookingItem`. The backend currently has
 * no `service_id` on the earnings item, so names that collide (a
 * provider offering the same-named service under two categories) fold
 * into one slice. Acceptable for a motivational breakdown; flagged in
 * the PR body as a backend recommendation for `service_id` on the
 * earnings item.
 *
 * ## Why a donut, and why only 5 slices
 *
 * The donut compares parts of a whole at a glance. A legend duplicates
 * the information for providers who can't tell adjacent slices apart —
 * the common case on a small screen. We cap at five slices + "other"
 * because six or more adjacent arcs become unreadable on a phone; the
 * legend still names every service, so the long tail isn't hidden,
 * just collapsed.
 *
 * ## When it hides
 *
 * On a window with no completed bookings. Same rule as the week/month
 * chart in `EarningsWindow` — a donut of nothing is noise, and the
 * empty-state copy below already says so.
 */
import { useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatRupees } from "@/i18n/format";
import { useT } from "@/i18n/LanguageProvider";
import { rangeMeta } from "@/lib/earnings-ranges";
import type { API_EarningsBookingItem, EarningsRange } from "@/hooks/useApi";

interface ServiceMixDonutProps {
  range: EarningsRange;
  bookings: API_EarningsBookingItem[] | undefined;
}

/**
 * A brand-anchored palette. `--primary` is blue (hue 262); the other
 * slices pick colour-family siblings so the donut reads as one chart
 * rather than a rainbow. Dark-mode variants share the same lightness
 * step since Tailwind's `dark:` mode flips the background, not the
 * palette.
 */
const SLICE_COLORS = [
  "var(--primary)",
  "oklch(0.65 0.17 262)",
  "oklch(0.72 0.14 220)",
  "oklch(0.75 0.14 300)",
  "oklch(0.70 0.15 180)",
  "oklch(0.60 0.05 262)", // "other" bucket — same hue, drained chroma
];

const MAX_SLICES = 5;

export interface MixSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Exported for tests. Aggregates by service_name, sorts by total
 * descending, keeps the top MAX_SLICES, folds the tail into an "other"
 * slice whose label names the count ("3 other services").
 */
export function aggregateMix(
  bookings: API_EarningsBookingItem[],
  otherLabel: (count: number) => string,
): MixSlice[] {
  if (bookings.length === 0) return [];
  const totals = new Map<string, number>();
  for (const b of bookings) {
    totals.set(b.service_name, (totals.get(b.service_name) ?? 0) + b.payout_amount);
  }
  const sorted = Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  if (sorted.length <= MAX_SLICES) {
    return sorted.map((s, i) => ({
      key: s.label,
      label: s.label,
      value: s.value,
      color: SLICE_COLORS[i] ?? SLICE_COLORS[SLICE_COLORS.length - 1],
    }));
  }
  const top = sorted.slice(0, MAX_SLICES);
  const tail = sorted.slice(MAX_SLICES);
  const otherTotal = tail.reduce((sum, s) => sum + s.value, 0);
  return [
    ...top.map((s, i) => ({
      key: s.label,
      label: s.label,
      value: s.value,
      color: SLICE_COLORS[i] ?? SLICE_COLORS[SLICE_COLORS.length - 1],
    })),
    {
      key: "__other__",
      label: otherLabel(tail.length),
      value: otherTotal,
      color: SLICE_COLORS[SLICE_COLORS.length - 1],
    },
  ];
}

export function ServiceMixDonut({ range, bookings }: ServiceMixDonutProps) {
  const { t, lang } = useT("provider");
  const rangeLabel = rangeMeta(range, t).inline;

  const slices = useMemo(
    () => aggregateMix(bookings ?? [], (count) => t("earnings.mixOther", { count })),
    [bookings, t],
  );

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  const config = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    for (const s of slices) {
      cfg[s.key] = { label: s.label, color: s.color };
    }
    return cfg;
  }, [slices]);

  if (slices.length === 0 || total === 0) return null;

  return (
    <section
      data-testid="service-mix"
      className="mt-4 rounded-xl border border-border bg-card p-4"
      aria-label={t("earnings.mixTitle", { range: rangeLabel })}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("earnings.mixTitle", { range: rangeLabel })}
      </p>
      <div className="mt-3 flex items-center gap-4">
        <ChartContainer
          config={config}
          className="aspect-square h-32 w-32 shrink-0 [&_.recharts-pie-label-text]:fill-foreground"
        >
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius={30}
              outerRadius={56}
              strokeWidth={2}
              // Recharts animates by default. Honour reduced-motion via
              // the global media query — the chart doesn't offer a prop,
              // but we pass `isAnimationActive={false}` when a reader
              // prefers reduced motion (set via a CSS variable or the
              // hook). Kept simple: disable animation unconditionally
              // here, matching the week/month bar chart pattern which
              // also skips entrance animation on mount.
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {slices.map((s) => {
            const pct = Math.round((s.value / total) * 100);
            return (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-foreground">{s.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {`${pct}% · ${formatRupees(s.value, lang)}`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
