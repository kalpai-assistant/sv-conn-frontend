/**
 * One booking: what it is, who's on it, the money, and everything that happened
 * to it. Mounted per id (the page keys it), so nothing from one booking can show
 * under another. Names, notes and the address come from outside: all rendered as text.
 */
import { useRef, useState } from "react";
import { X } from "lucide-react";
import { BookingStatusPill, DisputedMark } from "@/components/bookings/BookingBadges";
import { ForceCancelDialog } from "@/components/bookings/ForceCancelDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import {
  actorLabel,
  bookingPath,
  formatIst,
  formatRupees,
  humanize,
  isCancellable,
  shortId,
  timelineProChange,
  timelineTitle,
  totalCharged,
  type Booking,
  type TimelineItem,
} from "@/lib/bookings";
import { useApiGet, type ApiGetState } from "@/lib/use-api-get";

type Notice = { kind: "success" | "error"; text: string };

const WRAP = "[overflow-wrap:anywhere]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`text-sm ${WRAP}`}>{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function MoneyRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 text-sm ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function BookingFacts({ booking }: { booking: Booking }) {
  const provider = booking.provider_name ?? (booking.provider_id ? "(no name)" : "Unassigned");
  const business = booking.service_provider?.business_name;
  return (
    <div className="space-y-4">
      <Section title="Summary">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <span className="flex flex-wrap items-center gap-2">
              <BookingStatusPill status={booking.status} />
              {booking.is_disputed && <DisputedMark withLabel />}
            </span>
          </Field>
          <Field label="Disputed">{booking.is_disputed ? "Yes" : "No"}</Field>
          <Field label="Created (IST)">{formatIst(booking.created_at)}</Field>
          <Field label="Scheduled (IST)">
            {booking.scheduled_at ? formatIst(booking.scheduled_at) : "Not scheduled"}
          </Field>
          {booking.cancellation_reason != null && (
            <div className="sm:col-span-2">
              <Field label="Cancellation reason">{booking.cancellation_reason}</Field>
            </div>
          )}
        </dl>
      </Section>

      <Section title="People and place">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer phone">
            <span className="tabular-nums">{booking.consumer_phone ?? "Unknown"}</span>
          </Field>
          <Field label="Service provider">
            {provider}
            {business && business !== provider && (
              <span className="block text-xs text-muted-foreground">{business}</span>
            )}
          </Field>
          <Field label="Pro">{booking.professional?.display_name ?? "None assigned"}</Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              {booking.address ? (
                <>
                  {booking.address.label && (
                    <span className="block text-xs text-muted-foreground">
                      {booking.address.label}
                    </span>
                  )}
                  {booking.address.full_address}
                </>
              ) : (
                "None"
              )}
            </Field>
          </div>
        </dl>
      </Section>

      <Section title="Items">
        {booking.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items on this booking.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {booking.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className={`min-w-0 ${WRAP}`}>
                  {item.service_name}
                  {item.variant_label && (
                    <span className="text-muted-foreground"> · {item.variant_label}</span>
                  )}
                  <span className="text-muted-foreground"> × {item.quantity}</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatRupees(item.total_price)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Payment">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Method">
            {booking.payment_method ? humanize(booking.payment_method) : "Not chosen"}
          </Field>
          <Field label="Payment status">{humanize(booking.payment_status)}</Field>
          {booking.settlement_status != null && (
            <Field label="Settlement">{humanize(booking.settlement_status)}</Field>
          )}
          {booking.settled_at != null && (
            <Field label="Settled (IST)">{formatIst(booking.settled_at)}</Field>
          )}
        </dl>
        <dl className="space-y-1 border-t pt-3">
          <MoneyRow label="Service amount" value={formatRupees(booking.service_amount)} />
          <MoneyRow
            label="Discount"
            value={
              booking.discount_amount > 0 ? `− ${formatRupees(booking.discount_amount)}` : "None"
            }
          />
          <MoneyRow
            label="Tip"
            value={booking.tip_amount > 0 ? formatRupees(booking.tip_amount) : "None"}
          />
          <MoneyRow label="Total charged" value={formatRupees(totalCharged(booking))} strong />
        </dl>
        <dl className="space-y-1 border-t pt-3">
          <MoneyRow label="Platform commission" value={formatRupees(booking.platform_commission)} />
          <MoneyRow label="Provider payout" value={formatRupees(booking.provider_payout)} />
        </dl>
      </Section>
    </div>
  );
}

function Timeline({ state }: { state: ApiGetState<TimelineItem[]> & { retry: () => void } }) {
  return (
    <Section title="Timeline">
      {state.status === "loading" && <LoadingState rows={3} />}
      {state.status === "error" && (
        <ErrorState message="Couldn't load the timeline." onRetry={state.retry} />
      )}
      {state.status === "ready" && state.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing recorded for this booking.</p>
      )}
      {state.status === "ready" && state.data.length > 0 && (
        <ol aria-label="Timeline entries" className="space-y-3 border-l pl-4">
          {state.data.map((item, index) => {
            const change = timelineProChange(item);
            return (
              <li key={`${item.created_at}-${index}`} className="relative space-y-0.5">
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 -left-[1.3rem] size-2 rounded-full ${
                    item.type === "status" ? "bg-primary" : "bg-muted-foreground"
                  }`}
                />
                <p className="text-sm font-medium">{timelineTitle(item)}</p>
                {change && <p className={`text-sm ${WRAP}`}>{change}</p>}
                <p className={`text-xs text-muted-foreground ${WRAP}`}>
                  {formatIst(item.created_at)} · By{" "}
                  {actorLabel(item.actor_name, item.actor_user_id)}
                </p>
                {item.note && (
                  <p className={`text-xs ${WRAP}`}>
                    <span className="text-muted-foreground">Note: </span>
                    {item.note}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

interface BookingDetailPaneProps {
  bookingId: string;
  canCancel: boolean;
  onClose: () => void;
  /** After a cancel, or a refused one: the list is out of date either way. */
  onChanged: () => void;
}

export function BookingDetailPane({
  bookingId,
  canCancel,
  onClose,
  onChanged,
}: BookingDetailPaneProps) {
  const path = bookingPath(bookingId);
  const detail = useApiGet<Booking>(path);
  const timeline = useApiGet<TimelineItem[]>(`${path}/timeline`);

  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // State updates a render late, and a double click is quicker than that.
  const inFlight = useRef(false);

  function refreshAll() {
    detail.refresh();
    timeline.refresh();
    onChanged();
  }

  async function forceCancel(reason: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setDialogError(null);
    try {
      const cancelled = await apiFetch<Booking>(`${path}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setDialogOpen(false);
      setNotice({
        kind: "success",
        text:
          cancelled?.payment_status === "refund_processing"
            ? "Booking cancelled. The refund has started."
            : "Booking cancelled.",
      });
      refreshAll();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        // Someone or something got there first. Show what the backend says, and what's true now.
        setDialogOpen(false);
        setNotice({ kind: "error", text: error.message });
        refreshAll();
      } else if (error instanceof ApiError && error.status === 403) {
        setDialogError("Your role can't cancel bookings.");
      } else if (error instanceof ApiError && error.status < 500) {
        setDialogError(error.message);
      } else {
        setDialogError("Couldn't cancel this booking. Please try again.");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const booking = detail.status === "ready" ? detail.data : null;
  const notFound =
    detail.status === "error" && detail.error instanceof ApiError && detail.error.status === 404;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Booking {shortId(bookingId)}</h2>
          <p className={`font-mono text-xs text-muted-foreground ${WRAP}`}>{bookingId}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close booking" onClick={onClose}>
          <X />
        </Button>
      </div>

      {notice && (
        <Alert
          variant={notice.kind === "error" ? "destructive" : "default"}
          // Alert defaults to role="alert", which is too loud for a confirmation.
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "success" ? "border-success/40 bg-success/10" : ""}
        >
          <AlertDescription className={WRAP}>{notice.text}</AlertDescription>
        </Alert>
      )}

      {detail.status === "loading" && <LoadingState rows={4} />}
      {notFound && (
        <div className="rounded-lg border border-dashed">
          <EmptyState message="No booking with this ID" detail="Check the ID and try again." />
        </div>
      )}
      {detail.status === "error" && !notFound && (
        <ErrorState message="Couldn't load this booking." onRetry={detail.retry} />
      )}

      {booking && (
        <>
          {canCancel && isCancellable(booking.status) && (
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => {
                setDialogError(null);
                setDialogOpen(true);
              }}
            >
              Force cancel
            </Button>
          )}
          <BookingFacts booking={booking} />
          {dialogOpen && (
            <ForceCancelDialog
              booking={booking}
              open
              busy={busy}
              error={dialogError}
              onOpenChange={setDialogOpen}
              onConfirm={forceCancel}
            />
          )}
        </>
      )}

      {!notFound && <Timeline state={timeline} />}
    </div>
  );
}
