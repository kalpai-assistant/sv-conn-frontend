/**
 * The two lists in an SP's detail: the bookings behind its figures, and its
 * payout history. Each is a table where the pane is wide and cards where it
 * isn't. Failure reasons and names come from outside: all rendered as text.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { OutcomePill, SettlementPill } from "@/components/payouts/PayoutBadges";
import { Pager } from "@/components/payouts/Pager";
import { SettlementSelect } from "@/components/payouts/PayoutToolbar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIst, shortId } from "@/lib/bookings";
import { formatPaise } from "@/lib/money";
import {
  PAYOUT_BOOKINGS_PAGE_SIZE,
  PAYOUT_HISTORY_PAGE_SIZE,
  historyActor,
  historySource,
  settlementLabel,
  type PayoutBooking,
  type PayoutBookingsPage,
  type PayoutHistoryPage,
  type SettlementStatus,
} from "@/lib/payouts";
import type { ApiGetState } from "@/lib/use-api-get";

const WRAP = "[overflow-wrap:anywhere]";

export function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function BookingLink({ id }: { id: string }) {
  return (
    <Link
      to="/operator/bookings"
      search={{ booking: id }}
      aria-label={`Booking ${shortId(id)}`}
      className="font-mono text-xs text-primary underline-offset-2 hover:underline"
    >
      {shortId(id)}
    </Link>
  );
}

function completed(booking: PayoutBooking): string {
  return booking.completed_at ? formatIst(booking.completed_at) : "Not recorded";
}

function discount(paise: number): string {
  return paise > 0 ? `− ${formatPaise(paise)}` : "None";
}

function tip(paise: number): string {
  return paise > 0 ? formatPaise(paise) : "None";
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

type Loadable<T> = ApiGetState<T> & { retry: () => void };

export function ContributingBookings({
  state,
  status,
  page,
  onStatus,
  onPage,
}: {
  state: Loadable<PayoutBookingsPage>;
  status: SettlementStatus | undefined;
  page: number;
  onStatus: (status: SettlementStatus | undefined) => void;
  onPage: (page: number) => void;
}) {
  const data = state.status === "ready" ? state.data : null;
  return (
    <Section title="Contributing bookings">
      <p className="text-xs text-muted-foreground">
        Newest completion first. Price at booking is the amount fixed when the customer booked.
      </p>
      <div className="max-w-xs">
        <SettlementSelect
          label="Payout status"
          value={status}
          allLabel="All statuses"
          onChange={onStatus}
        />
      </div>
      {state.status === "loading" && <LoadingState rows={3} />}
      {state.status === "error" && (
        <ErrorState message="Couldn't load this SP's bookings." onRetry={state.retry} />
      )}
      {data && data.bookings.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {status
            ? `No ${settlementLabel(status).toLowerCase()} bookings${page > 1 ? " on this page" : ""}.`
            : page > 1
              ? "Nothing on this page."
              : "No bookings yet."}
        </p>
      )}
      {data && data.bookings.length > 0 && (
        <div className="@container">
          <ul aria-label="Bookings" className="space-y-2 @5xl:hidden">
            {data.bookings.map((booking) => (
              <li key={booking.booking_id} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <BookingLink id={booking.booking_id} />
                  <SettlementPill status={booking.settlement_status} />
                  <span className="text-xs text-muted-foreground">{completed(booking)}</span>
                </div>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <Money
                    label="Price at booking"
                    value={formatPaise(booking.service_amount_paise)}
                  />
                  <Money label="Discount" value={discount(booking.discount_amount_paise)} />
                  <Money
                    label="Commission"
                    value={formatPaise(booking.platform_commission_paise)}
                  />
                  <Money label="SP payout" value={formatPaise(booking.provider_payout_paise)} />
                  <Money label="Tip" value={tip(booking.tip_amount_paise)} />
                  <Money label="Pro" value={booking.professional_name ?? "Not recorded"} />
                </dl>
                {booking.settlement_failure_reason && (
                  <p className={`text-sm text-destructive ${WRAP}`}>
                    <span className="font-medium">Failure reason: </span>
                    {booking.settlement_failure_reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-lg border @5xl:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Completed (IST)</TableHead>
                  <TableHead className="text-right">Price at booking</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">SP payout</TableHead>
                  <TableHead className="text-right">Tip</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Failure reason</TableHead>
                  <TableHead>Pro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.bookings.map((booking) => (
                  <TableRow key={booking.booking_id} className="align-top">
                    <TableCell>
                      <BookingLink id={booking.booking_id} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{completed(booking)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPaise(booking.service_amount_paise)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {discount(booking.discount_amount_paise)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPaise(booking.platform_commission_paise)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatPaise(booking.provider_payout_paise)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {tip(booking.tip_amount_paise)}
                    </TableCell>
                    <TableCell>
                      <SettlementPill status={booking.settlement_status} />
                    </TableCell>
                    <TableCell className={`whitespace-normal text-destructive ${WRAP}`}>
                      {booking.settlement_failure_reason ?? ""}
                    </TableCell>
                    <TableCell className={`whitespace-normal ${WRAP}`}>
                      {booking.professional_name ?? "Not recorded"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {data && (
        <Pager
          label="Booking pages"
          page={page}
          total={data.total}
          perPage={PAYOUT_BOOKINGS_PAGE_SIZE}
          noun={["booking", "bookings"]}
          onPage={onPage}
        />
      )}
    </Section>
  );
}

export function PayoutHistory({
  state,
  page,
  onPage,
}: {
  state: Loadable<PayoutHistoryPage>;
  page: number;
  onPage: (page: number) => void;
}) {
  const data = state.status === "ready" ? state.data : null;
  return (
    <Section title="Payout history">
      {state.status === "loading" && <LoadingState rows={3} />}
      {state.status === "error" && (
        <ErrorState message="Couldn't load the payout history." onRetry={state.retry} />
      )}
      {data && data.entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {page > 1 ? "Nothing on this page." : "No payouts yet."}
        </p>
      )}
      {data && data.entries.length > 0 && (
        <div className="@container">
          <ol aria-label="Payout attempts" className="space-y-2 @4xl:hidden">
            {data.entries.map((entry) => (
              <li key={entry.audit_id} className="space-y-1 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <OutcomePill outcome={entry.outcome} />
                  <span className="text-xs text-muted-foreground">
                    {formatIst(entry.created_at)}
                  </span>
                </div>
                <p className="tabular-nums">
                  <span className="font-medium">{formatPaise(entry.amount_paise)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {entry.booking_count} {entry.booking_count === 1 ? "booking" : "bookings"}
                  </span>
                </p>
                <p className={`text-xs text-muted-foreground ${WRAP}`}>
                  Source: {historySource(entry)} · By {historyActor(entry)}
                </p>
                {entry.error && (
                  <p className={`text-sm text-destructive ${WRAP}`}>
                    <span className="font-medium">Error: </span>
                    {entry.error}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <div className="hidden overflow-hidden rounded-lg border @4xl:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time (IST)</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.map((entry) => (
                  <TableRow key={entry.audit_id} className="align-top">
                    <TableCell className="whitespace-nowrap">
                      {formatIst(entry.created_at)}
                    </TableCell>
                    <TableCell>
                      <OutcomePill outcome={entry.outcome} />
                    </TableCell>
                    <TableCell>{historySource(entry)}</TableCell>
                    <TableCell className={`whitespace-normal ${WRAP}`}>
                      {historyActor(entry)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPaise(entry.amount_paise)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{entry.booking_count}</TableCell>
                    <TableCell className={`whitespace-normal text-destructive ${WRAP}`}>
                      {entry.error ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {data && (
        <Pager
          label="History pages"
          page={page}
          total={data.total}
          perPage={PAYOUT_HISTORY_PAGE_SIZE}
          noun={["attempt", "attempts"]}
          onPage={onPage}
        />
      )}
    </Section>
  );
}
