/**
 * The coupon list (SVC-429): stacked cards in a narrow container, a table in a
 * wide one. A container query, not a viewport one, so the sidebar's width counts.
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { CouponStatusPill, PersonalTag } from "@/components/coupons/CouponBadges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIst } from "@/lib/bookings";
import {
  discountLabel,
  minOrderLabel,
  usageLabel,
  validityLabel,
  type CouponRow,
} from "@/lib/coupons";
import { formatRupees } from "@/lib/money";

const WRAP = "[overflow-wrap:anywhere]";

export function CouponList({ rows }: { rows: CouponRow[] }) {
  return (
    <div className="@container">
      <ul aria-label="Coupons" className="space-y-2 @3xl:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              to="/operator/coupons/$code"
              params={{ code: row.code }}
              aria-label={`Open ${row.code}`}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-secondary/60"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-mono font-semibold ${WRAP}`}>{row.code}</span>
                  <CouponStatusPill status={row.status} />
                </div>
                <p>
                  {discountLabel(row)}
                  <span className="text-muted-foreground">
                    {" "}
                    · {minOrderLabel(row.min_order_amount)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{validityLabel(row)} (IST)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs tabular-nums">Used {usageLabel(row)}</span>
                  <PersonalTag row={row} />
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-lg border @3xl:block">
        <Table aria-label="Coupons">
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Min order</TableHead>
              <TableHead>Valid (IST)</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="align-top">
                <TableCell className="whitespace-normal">
                  <Link
                    to="/operator/coupons/$code"
                    params={{ code: row.code }}
                    aria-label={`Open ${row.code}`}
                    className={`font-mono font-semibold text-primary underline-offset-2 hover:underline ${WRAP}`}
                  >
                    {row.code}
                  </Link>
                  {row.user_id && (
                    <div className="mt-1">
                      <PersonalTag row={row} />
                    </div>
                  )}
                </TableCell>
                <TableCell>{discountLabel(row)}</TableCell>
                <TableCell className="tabular-nums">
                  {row.min_order_amount ? formatRupees(row.min_order_amount) : "—"}
                </TableCell>
                <TableCell className="whitespace-normal text-xs">
                  <div>{formatIst(row.valid_from)}</div>
                  <div className="text-muted-foreground">to {formatIst(row.valid_until)}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{usageLabel(row)}</TableCell>
                <TableCell>
                  <CouponStatusPill status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
