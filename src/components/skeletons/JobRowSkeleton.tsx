/**
 * Placeholder matching the job row on the SP's bookings list
 * (`provider/bookings/index.tsx`) and the Pro's jobs list
 * (`pro/jobs/index.tsx`) — the two rows share their layout.
 *
 * `rounded-xl border p-4`: a truncated text-sm title, the address line, then
 * a status pill (text-xs, py-0.5 → 20px) beside a short figure, and the
 * chevron on the right. Bars carry `my-0.5` so each matches its line's height.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function JobRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <Skeleton className="my-0.5 h-4 w-1/2" />
        <Skeleton className="mt-1 mb-0.5 h-3 w-3/4" />
        <div className="mt-1.5 flex items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-4 w-4 shrink-0" />
    </div>
  );
}
