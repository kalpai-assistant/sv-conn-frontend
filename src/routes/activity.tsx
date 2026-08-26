import { createFileRoute } from "@tanstack/react-router";
import { useBookings } from "@/hooks/useApi";
import { Activity } from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { BookingCardSkeleton } from "@/components/skeletons/BookingCardSkeleton";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — EazyServ" },
      { name: "description", content: "Your recent service activity." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { data: bookings, isLoading, isError, refetch } = useBookings();

  const sorted = [...(bookings || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const { pull, refreshing, armed } = usePullToRefresh(refetch);

  return (
    <div className="min-h-screen pb-20">
      <PullToRefreshIndicator pull={pull} refreshing={refreshing} armed={armed} />
      <div className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-card px-4">
        <h1 className="text-lg font-semibold text-foreground">Activity</h1>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-3">
        {isLoading ? (
          <>
            <BookingCardSkeleton />
            <BookingCardSkeleton />
            <BookingCardSkeleton />
          </>
        ) : isError ? (
          // Without this an API blip leaves users staring at the loader
          // forever — worse than a plain error, because it looks like real
          // data is on the way when nothing is coming.
          <ErrorState message="Couldn't load your activity." onRetry={refetch} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No recent activity"
            subtitle="Your bookings and their updates will show up here."
          />
        ) : (
          sorted.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                {b.service.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{b.service.name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(b.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · ₹{b.totalAmount}
                </p>
              </div>
              <span className="text-xs text-muted-foreground capitalize">
                {b.status.replace("_", " ").toLowerCase()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
