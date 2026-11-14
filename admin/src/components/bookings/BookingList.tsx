/**
 * One page of bookings. A table where the pane is wide enough, cards where it
 * isn't: legacy's eight-column table clipped Status and Total at phone width
 * (SVC-355). The pane decides, not the window, because it narrows when the detail
 * opens beside it.
 */
import { ChevronRight } from "lucide-react";
import { BookingStatusPill, DisputedMark } from "@/components/bookings/BookingBadges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatIst,
  formatRupees,
  itemsSummary,
  shortId,
  totalCharged,
  type Booking,
} from "@/lib/bookings";

interface BookingListProps {
  bookings: Booking[];
  selectedId: string | undefined;
  onOpen: (id: string) => void;
}

function rowData(booking: Booking) {
  return {
    shortId: shortId(booking.id),
    created: formatIst(booking.created_at),
    customer: booking.consumer_phone ?? "Unknown",
    provider: booking.provider_name ?? (booking.provider_id ? "(no name)" : "Unassigned"),
    service: itemsSummary(booking.items),
    total: formatRupees(totalCharged(booking)),
  };
}

const WRAP = "[overflow-wrap:anywhere]";

export function BookingList({ bookings, selectedId, onOpen }: BookingListProps) {
  return (
    <div className="@container">
      <ul aria-label="Bookings" className="space-y-2 @3xl:hidden">
        {bookings.map((booking) => {
          const row = rowData(booking);
          const isSelected = booking.id === selectedId;
          return (
            <li key={booking.id}>
              <button
                type="button"
                aria-current={isSelected ? "true" : undefined}
                aria-label={`Open booking ${row.shortId}`}
                onClick={() => onOpen(booking.id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-secondary/40 ${
                  isSelected ? "bg-secondary" : "bg-card"
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{row.shortId}</span>
                    <BookingStatusPill status={booking.status} />
                    {booking.is_disputed && <DisputedMark withLabel />}
                  </div>
                  <p className={`font-medium ${WRAP}`}>{row.service}</p>
                  <p className={`text-muted-foreground ${WRAP}`}>
                    <span className="tabular-nums">{row.customer}</span> · {row.provider}
                  </p>
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span className="text-sm font-medium text-foreground tabular-nums">
                      {row.total}
                    </span>
                    <span>{row.created}</span>
                  </p>
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border @3xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead>Created (IST)</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Service provider</TableHead>
              <TableHead>Service</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((booking) => {
              const row = rowData(booking);
              const isSelected = booking.id === selectedId;
              return (
                <TableRow
                  key={booking.id}
                  onClick={() => onOpen(booking.id)}
                  className={`cursor-pointer ${isSelected ? "bg-secondary" : ""}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {/* The row is clickable for a mouse; this is the way in for a keyboard. */}
                      <button
                        type="button"
                        aria-current={isSelected ? "true" : undefined}
                        aria-label={`Open booking ${row.shortId}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(booking.id);
                        }}
                        className="rounded font-mono text-xs underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {row.shortId}
                      </button>
                      {booking.is_disputed && <DisputedMark />}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.created}</TableCell>
                  <TableCell className="tabular-nums">{row.customer}</TableCell>
                  <TableCell className={`whitespace-normal ${WRAP}`}>{row.provider}</TableCell>
                  <TableCell className={`whitespace-normal ${WRAP}`}>{row.service}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{row.total}</TableCell>
                  <TableCell>
                    <BookingStatusPill status={booking.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
