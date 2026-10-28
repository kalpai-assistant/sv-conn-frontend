/**
 * Placeholder matching the Pro home's current-job card (`CurrentJob` in
 * `pro/index.tsx`): the primary-coloured status strip, the service name, the
 * address block, "Open job" on the right, then the next-step button.
 *
 * Shaped after the busy case on purpose. That is the state that matters while
 * a Pro is working; when there is no job, the short idle row replaces it and
 * the page shortens, which reads as "nothing to do" rather than a glitch.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "./LoadingRegion";

export function CurrentJobSkeleton() {
  return (
    <LoadingRegion className="mt-6 overflow-hidden rounded-xl border border-primary/40 bg-card">
      <div className="flex items-center justify-between gap-3 bg-primary/20 px-4 py-2">
        <Skeleton className="h-3 w-24 bg-primary/30" />
        <Skeleton className="h-3 w-16 bg-primary/30" />
      </div>
      <div className="p-4">
        <Skeleton className="my-0.5 h-4 w-1/2" />
        <Skeleton className="mt-2 h-10 w-full rounded-lg" />
        <div className="mt-2 flex justify-end">
          <Skeleton className="my-0.5 h-4 w-20" />
        </div>
        <Skeleton className="mt-3 h-9 w-full" />
      </div>
    </LoadingRegion>
  );
}
