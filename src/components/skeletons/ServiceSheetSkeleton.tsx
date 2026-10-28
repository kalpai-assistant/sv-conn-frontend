/**
 * Placeholder for `ServiceSheet`'s body while the service loads: the 40:17
 * banner, the summary card (title, description, duration and price), and the
 * sticky add-to-cart bar. The sheet's own handle and header stay real around
 * it.
 *
 * Everything below the summary card (variants, trust strip, the SVC-392
 * sections) depends on the service and is left out.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "./LoadingRegion";

export function ServiceSheetSkeleton() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-hidden pb-4">
        <Skeleton className="w-full rounded-none" style={{ aspectRatio: "40 / 17" }} />
        <div className="px-4 pt-4">
          <div className="rounded-xl border border-border bg-card p-4">
            {/* text-lg title: 28px line */}
            <Skeleton className="my-1 h-5 w-2/3" />
            <div className="mt-2 flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-border bg-card p-4">
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    </LoadingRegion>
  );
}
