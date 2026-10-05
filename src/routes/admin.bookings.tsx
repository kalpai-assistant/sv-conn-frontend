/**
 * Admin bookings surface (SVC-299).
 *
 * Two pieces of the ticket in one route: a filterable list of every booking
 * on the platform, and a side sheet that opens the picked row + carries the
 * red "Force cancel" action. Both consume the admin-side endpoints already
 * gated by `require_role("admin")` + the IP allowlist on the backend router.
 *
 * Filters (top of page):
 *   - Status: all / requested / accepted / en_route / in_progress /
 *     completed / cancelled — server-side (`?status=...`).
 *   - Disputed toggle: `?disputed=true` when on. Off by default.
 *   - Date range: last 7 days by default; today / 30d / all also available.
 *     Client-side over `created_at` — the backend already paginates, and
 *     this narrows within what's on screen without duplicating the range
 *     query on the server for beta scale.
 *
 * Pagination: "Load more" (server pages of 50). Auto-append on click; a
 * dedupe by id defends against the server shifting rows mid-page as the
 * admin cancels things.
 *
 * Auth: gated by admin role via the AppGate in __root.tsx.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Loader2,
  ShieldOff,
  XCircle,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatRupees } from "@/lib/currency";
import {
  useAdminBookings,
  useAdminBooking,
  useForceCancelBooking,
  type API_AdminBookingResponse,
  type BookingStatusFilter,
} from "@/hooks/useApi";

export const Route = createFileRoute("/admin/bookings")({
  component: AdminBookingsPage,
});

type DateRange = "today" | "7d" | "30d" | "all";

const STATUS_OPTIONS: { value: BookingStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "accepted", label: "Accepted" },
  { value: "en_route", label: "En route" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const PER_PAGE = 50;

const rangeCutoffMs = (range: DateRange): number | null => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  switch (range) {
    case "today":
      // Naive local-day cutoff — good enough for a support UI in one timezone.
      return new Date().setHours(0, 0, 0, 0);
    case "7d":
      return now - 7 * day;
    case "30d":
      return now - 30 * day;
    case "all":
      return null;
  }
};

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  requested: { label: "Requested", variant: "secondary" },
  accepted: { label: "Accepted", variant: "default" },
  en_route: { label: "En route", variant: "default" },
  in_progress: { label: "In progress", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  expired: { label: "Expired", variant: "outline" },
};

/** First segment of a booking id — the whole UUID is too long for the row and
 *  the short form is enough for support to search on. */
const shortId = (id: string) => id.split("-")[0];

/** Cart summary — "Deep Clean" or "Deep Clean + 2 more" — mirrors the backend
 *  helper `_summarise_service_names`. Falls back to a placeholder for the rare
 *  case an admin lists a booking whose items are not populated. */
const summariseItems = (b: API_AdminBookingResponse) => {
  if (!b.items || b.items.length === 0) return "Service";
  const first = b.items[0].service_name;
  return b.items.length === 1 ? first : `${first} + ${b.items.length - 1} more`;
};

/** Total the consumer was charged, using the same math the backend uses:
 *  service_amount − discount + tip. Kept in one place so table and sheet
 *  agree on the number. */
const totalCharged = (b: API_AdminBookingResponse) =>
  Math.max(0, b.service_amount - b.discount_amount + b.tip_amount);

function AdminBookingsPage() {
  const [status, setStatus] = useState<BookingStatusFilter>("all");
  const [disputed, setDisputed] = useState(false);
  const [range, setRange] = useState<DateRange>("7d");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The list is server-paginated; accumulate pages client-side for "Load more".
  // Keyed on the filter tuple so a filter change resets the accumulation.
  const [accumulated, setAccumulated] = useState<{
    key: string;
    rows: API_AdminBookingResponse[];
  }>({ key: "", rows: [] });

  // Bump this key when any *server-side* filter changes; date range is
  // client-side, so it doesn't reset the accumulated pages.
  const filterKey = `${status}|${disputed}`;

  const query = useAdminBookings({ status, disputed, page, perPage: PER_PAGE });

  // Merge pages as they arrive. Dedup by id so a booking whose row shifted
  // between pages (e.g. a cancel just changed its status) doesn't appear
  // twice.
  useMemo(() => {
    if (!query.data) return;
    setAccumulated((prev) => {
      const base = prev.key === filterKey ? prev.rows : [];
      const seen = new Set(base.map((b) => b.id));
      const merged = [...base];
      for (const row of query.data.bookings) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          merged.push(row);
        }
      }
      return { key: filterKey, rows: merged };
    });
    // We deliberately depend on the query data + filter tuple; the setState
    // callback reads previous accumulated state so no dep on `accumulated`.
  }, [query.data, filterKey]);

  // Reset paging when a server filter changes; date range is client-side.
  const changeStatus = (next: BookingStatusFilter) => {
    setStatus(next);
    setPage(1);
  };
  const changeDisputed = (next: boolean) => {
    setDisputed(next);
    setPage(1);
  };

  // Client-side date filter over the accumulated rows. Cheap enough at the 50
  // × N size the list actually reaches during beta, and keeps a range flip
  // instant without a round-trip.
  const cutoff = rangeCutoffMs(range);
  const visibleRows = accumulated.rows.filter((b) =>
    cutoff == null ? true : new Date(b.created_at).getTime() >= cutoff,
  );

  const totalKnown = query.data?.total ?? accumulated.rows.length;
  const hasMore = accumulated.rows.length < totalKnown;

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6 flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Bookings</h1>
            <p className="text-sm text-muted-foreground">
              Every booking on the platform. Tap a row to open the details and cancel if needed.
            </p>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <Select value={status} onValueChange={(v) => changeStatus(v as BookingStatusFilter)}>
              <SelectTrigger id="status-filter" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="range-filter" className="text-xs font-medium text-muted-foreground">
              Range
            </label>
            <Select value={range} onValueChange={(v) => setRange(v as DateRange)}>
              <SelectTrigger id="range-filter" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="ml-auto flex items-center gap-2 text-sm text-foreground">
            <Switch checked={disputed} onCheckedChange={changeDisputed} />
            Disputed only
          </label>
        </div>

        {query.isLoading && accumulated.rows.length === 0 && (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {query.isError && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : "Couldn't load bookings."}
            </p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {!query.isLoading && !query.isError && visibleRows.length === 0 && (
          <div className="rounded-lg border border-border bg-secondary/30 p-8 text-center">
            <p className="text-sm font-medium text-foreground">No bookings match these filters.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Widen the range or clear the status filter to see more.
            </p>
          </div>
        )}

        {visibleRows.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Booking</th>
                  <th className="px-3 py-2 font-medium">Service</th>
                  <th className="px-3 py-2 font-medium">Consumer</th>
                  <th className="px-3 py-2 font-medium">Provider</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((b) => (
                  <BookingRow key={b.id} booking={b} onOpen={() => setSelectedId(b.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {visibleRows.length} of {totalKnown}
          </span>
          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
            </Button>
          )}
        </div>

        <DetailSheet bookingId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
    </AdminShell>
  );
}

function BookingRow({
  booking,
  onOpen,
}: {
  booking: API_AdminBookingResponse;
  onOpen: () => void;
}) {
  const badge = STATUS_BADGE[booking.status] ?? { label: booking.status, variant: "outline" };
  const created = new Date(booking.created_at);
  return (
    <tr
      className="cursor-pointer border-t border-border transition-colors hover:bg-secondary/40"
      onClick={onOpen}
    >
      <td className="px-3 py-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          {booking.is_disputed && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Disputed" />
          )}
          {shortId(booking.id)}
        </div>
      </td>
      <td className="px-3 py-2">{summariseItems(booking)}</td>
      <td className="px-3 py-2 tabular-nums">{booking.consumer_phone ?? "—"}</td>
      <td className="px-3 py-2">{booking.provider_name ?? "—"}</td>
      <td className="px-3 py-2">
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {formatDistanceToNowStrict(created, { addSuffix: true })}
      </td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">
        {formatRupees(totalCharged(booking))}
      </td>
      <td className="px-3 py-2 text-right">
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </td>
    </tr>
  );
}

function DetailSheet({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const { data, isLoading, isError } = useAdminBooking(bookingId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClose = () => {
    setConfirmOpen(false);
    onClose();
  };

  return (
    <Sheet open={bookingId !== null} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Booking details</SheetTitle>
          <SheetDescription>
            {data ? <span className="font-mono text-xs">{shortId(data.id)}</span> : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {isError && (
          <p className="mt-6 text-sm text-destructive">
            Couldn't load this booking. Close and try again.
          </p>
        )}

        {data && !isLoading && !isError && (
          <div className="mt-6 space-y-6">
            <SummaryBlock booking={data} />
            <PartiesBlock booking={data} />
            <ItemsBlock booking={data} />
            <StatusHistoryBlock booking={data} />
            {data.status !== "cancelled" && data.status !== "completed" && (
              <Button variant="destructive" className="w-full" onClick={() => setConfirmOpen(true)}>
                <ShieldOff className="mr-2 h-4 w-4" />
                Force cancel booking
              </Button>
            )}
            {(data.status === "cancelled" || data.status === "completed") && (
              <p className="rounded-lg border border-border bg-secondary/30 p-3 text-center text-xs text-muted-foreground">
                This booking is already {data.status}. Force-cancel is disabled.
              </p>
            )}
          </div>
        )}

        {data && (
          <ForceCancelDialog
            open={confirmOpen}
            booking={data}
            onCancelDialog={() => setConfirmOpen(false)}
            onSuccess={handleClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SummaryBlock({ booking }: { booking: API_AdminBookingResponse }) {
  const badge = STATUS_BADGE[booking.status] ?? { label: booking.status, variant: "outline" };
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
      <Field label="Status">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {booking.is_disputed && (
          <Badge variant="destructive" className="ml-2">
            Disputed
          </Badge>
        )}
      </Field>
      <Field label="Payment">
        {booking.payment_method ?? "—"} · {booking.payment_status}
      </Field>
      <Field label="Total charged">{formatRupees(totalCharged(booking))}</Field>
      <Field label="Service amount">{formatRupees(booking.service_amount)}</Field>
      <Field label="Discount">
        {booking.discount_amount > 0 ? `− ${formatRupees(booking.discount_amount)}` : "—"}
      </Field>
      <Field label="Tip">{booking.tip_amount > 0 ? formatRupees(booking.tip_amount) : "—"}</Field>
      <Field label="Created">
        {new Date(booking.created_at).toLocaleString()} (
        {formatDistanceToNowStrict(new Date(booking.created_at), { addSuffix: true })})
      </Field>
      {booking.scheduled_at && (
        <Field label="Scheduled">{new Date(booking.scheduled_at).toLocaleString()}</Field>
      )}
    </div>
  );
}

function PartiesBlock({ booking }: { booking: API_AdminBookingResponse }) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
      <Field label="Consumer">{booking.consumer_phone ?? "—"}</Field>
      <Field label="Provider">
        {booking.provider_name ?? (booking.provider_id ? "(unnamed)" : "Unassigned")}
      </Field>
      {booking.address && (
        <div className="sm:col-span-2">
          <Field label="Address">{booking.address.full_address}</Field>
        </div>
      )}
    </div>
  );
}

function ItemsBlock({ booking }: { booking: API_AdminBookingResponse }) {
  if (!booking.items || booking.items.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Items
      </p>
      <ul className="space-y-2 text-sm">
        {booking.items.map((it) => (
          <li key={it.id} className="flex items-center justify-between">
            <span>
              {it.service_name} × {it.quantity}
            </span>
            <span className="tabular-nums">{formatRupees(it.total_price)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusHistoryBlock({ booking }: { booking: API_AdminBookingResponse }) {
  if (!booking.status_history || booking.status_history.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Status history
      </p>
      <ol className="space-y-1 text-sm">
        {booking.status_history.map((e, idx) => (
          <li key={idx} className="flex items-center justify-between">
            <span className="capitalize">{e.to_status.replace("_", " ")}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNowStrict(new Date(e.created_at), { addSuffix: true })}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}

/** Refund policy the admin will see before confirming — mirrors the backend
 *  rules in ``BookingService._apply_cancellation_policy`` so the confirmation
 *  copy never disagrees with what actually happens. */
function refundPolicyCopy(booking: API_AdminBookingResponse): string {
  if (booking.payment_method !== "online") return "Cash booking — nothing captured to refund.";
  if (booking.payment_status !== "paid") {
    return "No payment captured — nothing to refund.";
  }
  const total = formatRupees(booking.service_amount - booking.discount_amount);
  if (booking.status === "requested") {
    return `Full refund of ${total} will be initiated via Razorpay.`;
  }
  if (booking.status === "accepted" || booking.status === "en_route") {
    return `${total} captured — will be refunded minus the ₹49 cancellation fee. The fee credits the provider's wallet.`;
  }
  // in_progress falls into the "no auto-refund" branch on the backend — the
  // job has already started, so support handles the refund manually.
  return "The job has already started — no automatic refund will be issued. Refund via the payments surface after cancelling if needed.";
}

function ForceCancelDialog({
  open,
  booking,
  onCancelDialog,
  onSuccess,
}: {
  open: boolean;
  booking: API_AdminBookingResponse;
  onCancelDialog: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cancel = useForceCancelBooking();
  const busy = cancel.isPending;

  const close = () => {
    if (busy) return;
    setReason("");
    setError(null);
    onCancelDialog();
  };

  const submit = () => {
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setError("Reason is required.");
      return;
    }
    setError(null);
    cancel.mutate(
      { bookingId: booking.id, reason: trimmed },
      {
        onSuccess: (res) => {
          // Backend flips payment_status to REFUND_PROCESSING when a refund
          // fires, and leaves it as-is otherwise — that's what tells us
          // whether to show the "refund initiated" copy vs "no refund needed".
          const refunded = res.payment_status === "refund_processing";
          toast.success(
            refunded
              ? "Booking cancelled, refund initiated"
              : "Booking cancelled, no refund needed",
          );
          setReason("");
          onSuccess();
        },
        onError: (err) => {
          // Keep the dialog open so the admin can read the backend's message
          // (409 for terminal states, etc.) and adjust.
          setError(err instanceof Error ? err.message : "Failed to cancel booking.");
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Force cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription>
            {refundPolicyCopy(booking)} A cancellation notification will be sent to the other party.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <label htmlFor="cancel-reason" className="text-sm font-medium text-foreground">
            Reason (required)
          </label>
          <Textarea
            id="cancel-reason"
            placeholder="e.g. Duplicate booking flagged by ops"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            Recorded on the booking's status log and on <code>cancellation_reason</code>.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep booking</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <XCircle className="mr-2 h-4 w-4" />
                Confirm cancel
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
