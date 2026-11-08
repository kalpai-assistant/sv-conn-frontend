import { TriangleAlert } from "lucide-react";
import { statusLabel } from "@/lib/bookings";

const STATUS_CLASSES: Record<string, string> = {
  requested: "border-border bg-muted text-foreground",
  accepted: "border-primary/30 bg-primary/10 text-primary",
  en_route: "border-primary/30 bg-primary/10 text-primary",
  in_progress: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-success/40 bg-success/10 text-success",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
  expired: "border-border bg-muted text-muted-foreground",
};

export function BookingStatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
        STATUS_CLASSES[status] ?? "border-border bg-muted text-foreground"
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

/** A marker that reads as "Disputed" to a screen reader as well as by eye. */
export function DisputedMark({ withLabel = false }: { withLabel?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-destructive"
      title="Disputed"
    >
      <TriangleAlert className="size-3.5" aria-hidden="true" />
      {withLabel ? "Disputed" : <span className="sr-only">Disputed</span>}
    </span>
  );
}
