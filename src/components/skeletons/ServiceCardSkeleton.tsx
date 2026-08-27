/**
 * Placeholder matching `ServiceCard` — the full-width row used on category
 * pages. `h-16 w-16` thumbnail, three stacked lines, price on the right.
 *
 * The real card already truncates its title to one line, so its height is
 * fixed and this matches without further constraint.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function ServiceCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl border border-border/50 bg-card p-3">
      <Skeleton className="h-16 w-16 flex-shrink-0 rounded-xl" />
      <div className="flex flex-1 flex-col justify-center gap-1.5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="flex flex-col items-end justify-center gap-1">
        <Skeleton className="h-2 w-6" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}
