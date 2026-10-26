/**
 * Placeholder for a 3-column grid of square tiles — the sub-category sheet
 * and the provider's services picker both lay their categories out this way.
 *
 * The tile itself is square, so a square block is the right shape here. Six
 * tiles fill two rows, which is what most categories have. Callers wrap it in
 * a `LoadingRegion`; the picker puts its search bar in the same region.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function TileGridSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`grid grid-cols-3 gap-3 ${className}`}>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-2xl" />
      ))}
    </div>
  );
}
