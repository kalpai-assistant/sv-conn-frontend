/**
 * Placeholder matching `ServiceCardCompact` — the w-40 tile on Home's
 * "Most booked" rail. An h-24 image band, then the p-3 text block: a
 * two-line title, category, duration and the "starting at" price.
 *
 * Each bar sits inside its text line's own height (`my-*` around a shorter
 * bar) so the tile comes out the same height as the real one.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function ServiceCardCompactSkeleton() {
  return (
    <div className="flex w-40 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="h-24 w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-1 p-3">
        {/* line-clamp-2 text-sm leading-tight: two 17.5px lines */}
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        <Skeleton className="my-0.5 h-3 w-1/2" />
        <div className="pt-1">
          <Skeleton className="my-0.5 h-3 w-12" />
        </div>
        <Skeleton className="my-0.5 h-4 w-20" />
      </div>
    </div>
  );
}
