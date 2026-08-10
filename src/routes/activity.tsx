import { createFileRoute } from "@tanstack/react-router";
import { useBookings } from "@/hooks/useApi";
import { AlertCircle, Loader2 } from "lucide-react";

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

  return (
    <div className="min-h-screen pb-20">
      <div className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-card px-4">
        <h1 className="text-lg font-semibold text-foreground">Activity</h1>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          // Without this an API blip leaves users staring at the loader
          // forever — worse than a plain error, because it looks like real
          // data is on the way when nothing is coming.
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Couldn't load your activity.</p>
            <button
              onClick={() => refetch()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No recent activity.</p>
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
