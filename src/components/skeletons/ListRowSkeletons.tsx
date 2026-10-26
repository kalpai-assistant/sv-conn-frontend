/**
 * Placeholders for the two icon-led list rows in the consumer's sheets.
 *
 * - `SearchResultSkeleton` — `SearchSheet`'s result row: an h-10 rounded-lg
 *   icon box, name and one-line description, price on the right. Rows sit in
 *   a `divide-y` list with `py-3`, so there is no border of its own.
 * - `CouponCardSkeleton` — `CouponsSheet`'s coupon: a bordered `p-3` card with
 *   a round h-10 icon, code and terms, and "Apply" on the right.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function SearchResultSkeleton() {
  return (
    <div className="flex items-start gap-3 py-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Skeleton className="my-0.5 h-4 w-3/5" />
        <Skeleton className="mt-1 mb-0.5 h-3 w-4/5" />
      </div>
      <Skeleton className="my-0.5 h-4 w-12 shrink-0" />
    </div>
  );
}

export function CouponCardSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border p-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <Skeleton className="my-0.5 h-4 w-20" />
        <Skeleton className="mt-1 mb-0.5 h-3 w-32" />
      </div>
      <Skeleton className="my-0.5 h-3 w-10 shrink-0" />
    </div>
  );
}
