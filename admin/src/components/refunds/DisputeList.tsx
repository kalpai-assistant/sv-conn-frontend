/**
 * The dispute queue (SVC-431): stacked cards in a narrow container, a table in a
 * wide one, as the coupon list. Each row opens its booking's dispute page.
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { DisputeStatusPill, RefundStatusPill } from "@/components/refunds/DisputeBadges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIst, shortId } from "@/lib/bookings";
import {
  customerLabel,
  reasonLabel,
  refundSummary,
  resolutionLabel,
  type DisputeRow,
} from "@/lib/disputes";

const WRAP = "[overflow-wrap:anywhere]";

function Resolution({ row }: { row: DisputeRow }) {
  if (row.resolution_type === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span>
      {resolutionLabel(row.resolution_type)}
      {row.refund_amount !== null && (
        <span className="block text-xs text-muted-foreground tabular-nums">
          {refundSummary(row)}
        </span>
      )}
    </span>
  );
}

export function DisputeList({ rows }: { rows: DisputeRow[] }) {
  return (
    <div className="@container">
      <ul aria-label="Disputes" className="space-y-2 @3xl:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              to="/operator/refunds/$bookingId"
              params={{ bookingId: row.booking_id }}
              aria-label={`Open booking ${shortId(row.booking_id)}`}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-secondary/60"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{shortId(row.booking_id)}</span>
                  <DisputeStatusPill status={row.status} />
                  <RefundStatusPill row={row} />
                </div>
                <p className={WRAP}>
                  {customerLabel(row)}
                  <span className="text-muted-foreground"> · {reasonLabel(row.reason_code)}</span>
                </p>
                {row.resolution_type && (
                  <p className="text-xs">
                    {resolutionLabel(row.resolution_type)}
                    {row.refund_amount !== null && (
                      <span className="text-muted-foreground tabular-nums">
                        {" "}
                        · {refundSummary(row)}
                      </span>
                    )}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Logged {formatIst(row.created_at)} (IST)
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-lg border @3xl:block">
        <Table aria-label="Disputes">
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Resolution</TableHead>
              <TableHead>Refund</TableHead>
              <TableHead>Logged (IST)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="align-top">
                <TableCell>
                  <Link
                    to="/operator/refunds/$bookingId"
                    params={{ bookingId: row.booking_id }}
                    aria-label={`Open booking ${shortId(row.booking_id)}`}
                    className="font-mono font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    {shortId(row.booking_id)}
                  </Link>
                </TableCell>
                <TableCell className={`whitespace-normal ${WRAP}`}>
                  {customerLabel(row)}
                  {row.customer_name && row.customer_phone && (
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {row.customer_phone}
                    </span>
                  )}
                </TableCell>
                <TableCell>{reasonLabel(row.reason_code)}</TableCell>
                <TableCell>
                  <DisputeStatusPill status={row.status} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <Resolution row={row} />
                </TableCell>
                <TableCell>
                  <RefundStatusPill row={row} />
                </TableCell>
                <TableCell className="text-xs">{formatIst(row.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
