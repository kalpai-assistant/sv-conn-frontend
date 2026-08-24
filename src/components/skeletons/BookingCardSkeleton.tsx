/**
 * Placeholder matching the booking row in `bookings.tsx` / `activity.tsx`.
 *
 * Dimensions track the real card exactly — `rounded-xl border p-4`, a
 * two-line block on the left with a pill on the right, then a second row —
 * so nothing shifts when data lands.
 *
 * That only holds because the real card's title is `truncate`d to one line.
 * A wrapping title makes the card taller than any fixed-height skeleton, and
 * no `min-h` can fix that: min-h stops a card being shorter, never taller.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function BookingCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-2/5" />
        </div>
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}
