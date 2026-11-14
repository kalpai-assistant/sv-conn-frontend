/**
 * Shared pieces of the two analytics dashboards (SVC-432): the page header with
 * the weeks selector and "Data as of", a chart card, a stat tile, a legend and a
 * tooltip box.
 *
 * Every colour is a token. Shades mix a token into the card with
 * color-mix(in oklab): oklch would interpolate hue too, and since the card
 * token carries a hue of its own the blue cells came out purple.
 * Night mode only swaps the tokens (SVC-383), so a
 * literal colour or a dark: class would stay put while the card under it changes.
 */
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Segmented } from "@/components/catalog/Field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { WEEK_OPTIONS, formatAsOf, type WeeksOption } from "@/lib/analytics";
import { cn } from "@/lib/utils";

// --- Chart styling, by token -------------------------------------------------

/** Never put chart-1 and chart-4 in one chart: they're nearly the same blue. */
export const COLOR = {
  c1: "var(--chart-1)",
  c2: "var(--chart-2)",
  c3: "var(--chart-3)",
  muted: "var(--muted-foreground)",
  fg: "var(--foreground)",
} as const;

export const AXIS = {
  stroke: "var(--border)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  tickLine: false,
} as const;

export const GRID = { stroke: "var(--border)", strokeDasharray: "3 3", vertical: false } as const;

export const CURSOR = { fill: "var(--muted)", opacity: 0.6 } as const;
export const LINE_CURSOR = { stroke: "var(--border)" } as const;

export const CHART_HEIGHT = 240;

// --- Page header ---------------------------------------------------------------

export function AnalyticsHeader({
  title,
  description,
  weeks,
  onWeeksChange,
  asOf,
}: {
  title: string;
  description: string;
  weeks: WeeksOption;
  onWeeksChange: (weeks: WeeksOption) => void;
  asOf: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        {asOf && (
          <p className="text-xs text-muted-foreground" data-testid="as-of">
            Data as of {formatAsOf(asOf)}. The figures refresh every 15 minutes.
          </p>
        )}
      </div>
      {/* The shared one-row control: four fixed buttons were 329px of a 343px
          phone row and widened the page on narrower screens or fonts. */}
      <Segmented
        name="analytics-weeks"
        label="Weeks shown"
        value={String(weeks)}
        options={WEEK_OPTIONS.map((option) => ({
          value: String(option),
          label: `${option} weeks`,
        }))}
        onChange={(value) => onWeeksChange(Number(value) as WeeksOption)}
        oneRow
      />
    </div>
  );
}

// --- Cards -----------------------------------------------------------------------

/**
 * A titled card. Wide content (a long chart, the heatmap, a table) scrolls
 * inside the card, never the page. `empty` replaces the body with a message.
 */
export function ChartCard({
  title,
  description,
  empty,
  minWidth,
  legend,
  note,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  empty?: string | null;
  /** The body's narrowest width in px; below it the body scrolls sideways. */
  minWidth?: number;
  legend?: ReactNode;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
        <CardTitle className="text-base">
          <h2>{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
        {empty ? (
          <EmptyState message={empty} />
        ) : (
          <>
            {legend}
            <div className="overflow-x-auto" data-testid="card-scroll">
              <div style={minWidth ? { minWidth } : undefined}>{children}</div>
            </div>
            {note}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function StatTile({
  label,
  value,
  detail,
  change,
}: {
  label: string;
  value: string;
  detail?: string;
  change?: { text: string; direction: "up" | "down" | null; against: string };
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-1 p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        {change && (
          <p
            className={cn(
              "flex items-center gap-1 text-xs",
              change.direction === "up" && "text-success",
              change.direction === "down" && "text-destructive",
              change.direction === null && "text-muted-foreground",
            )}
          >
            {change.direction === "up" && <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />}
            {change.direction === "down" && <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
            <span>
              {change.text} {change.against}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// --- Legend and tooltip --------------------------------------------------------------

export interface LegendEntry {
  label: string;
  color: string;
  /** A dashed line rather than a filled swatch. */
  dashed?: boolean;
}

export function Legend({ entries }: { entries: LegendEntry[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {entries.map((entry) => (
        <li key={entry.label} className="flex items-center gap-1.5">
          {entry.dashed ? (
            <span
              aria-hidden
              className="inline-block w-4 border-t-2 border-dashed"
              style={{ borderColor: entry.color }}
            />
          ) : (
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: entry.color }}
            />
          )}
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
