/** The analytics charts' tooltip box (SVC-432), in its own file so parts.tsx exports only components and constants. */
import type { TooltipContentProps } from "recharts";

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/**
 * A Recharts tooltip from the hovered row. The row is the point as mapped in
 * lib/analytics.ts, so the tooltip and the bars read the same numbers.
 */
export function tooltipFor<Row>(render: (row: Row) => { title: string; rows: TooltipRow[] }) {
  function ChartTooltip({ active, payload }: TooltipContentProps) {
    const row = payload?.[0]?.payload as Row | undefined;
    if (!active || !row) return null;
    const { title, rows } = render(row);
    return (
      <div className="min-w-40 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
        <p className="mb-1 font-medium">{title}</p>
        <dl className="space-y-0.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                {r.color && (
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ background: r.color }}
                  />
                )}
                {r.label}
              </dt>
              <dd className="tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  return ChartTooltip;
}
