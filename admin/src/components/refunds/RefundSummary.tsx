/**
 * The booking as a dispute needs it, and what's left to refund. Every amount is
 * the server's: nothing here adds or subtracts.
 */
import { Link } from "@tanstack/react-router";
import { BookingStatusPill } from "@/components/bookings/BookingBadges";
import { Fact, PageSection } from "@/components/teams/PageSection";
import type { AdminRole } from "@/lib/auth";
import { formatIst, humanize } from "@/lib/bookings";
import { channelLabel, isCapped, type DisputeDetail } from "@/lib/disputes";
import { formatRupees } from "@/lib/money";

const LINK = "font-medium text-primary underline-offset-2 hover:underline";

export function BookingContext({ booking }: { booking: DisputeDetail["booking"] }) {
  return (
    <PageSection title="Booking">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Fact label="Status">
          <BookingStatusPill status={booking.status} />
        </Fact>
        <Fact label="Scheduled (IST)">
          {booking.scheduled_at ? formatIst(booking.scheduled_at) : "Not scheduled"}
        </Fact>
        <Fact label="Customer">
          {booking.customer.name?.trim() || "Unnamed customer"}
          {booking.customer_phone && (
            <span className="block text-xs text-muted-foreground tabular-nums">
              {booking.customer_phone}
            </span>
          )}
        </Fact>
        <Fact label="Service provider">
          {booking.provider ? (
            <Link to="/operator/sps/$spId" params={{ spId: booking.provider.id }} className={LINK}>
              {booking.provider.name?.trim() || "(no name)"}
            </Link>
          ) : (
            "Unassigned"
          )}
        </Fact>
        <Fact label="Pro">
          {booking.professional ? (
            <Link
              to="/operator/pros/$proId"
              params={{ proId: booking.professional.id }}
              className={LINK}
            >
              {booking.professional.name?.trim() || "(no name)"}
            </Link>
          ) : (
            "None assigned"
          )}
        </Fact>
        <Fact label="Payment">
          {booking.payment_method ? humanize(booking.payment_method) : "Not chosen"} ·{" "}
          {humanize(booking.payment_status)}
        </Fact>
        {booking.cancellation_reason != null && (
          <div className="sm:col-span-2">
            <Fact label="Cancellation reason">{booking.cancellation_reason}</Fact>
          </div>
        )}
      </dl>
    </PageSection>
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
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

const minus = (amount: number) => (amount > 0 ? `− ${formatRupees(amount)}` : "None");

export function RefundSummary({
  booking,
  refunds,
  role,
}: {
  booking: DisputeDetail["booking"];
  refunds: DisputeDetail["refunds"];
  role: AdminRole;
}) {
  return (
    <PageSection title="Refund">
      <dl className="space-y-1">
        <MoneyRow label="Service amount" value={formatRupees(booking.service_amount)} />
        <MoneyRow
          label="Discount"
          value={
            booking.discount_amount > 0 ? `− ${formatRupees(booking.discount_amount)}` : "None"
          }
        />
        <MoneyRow
          label="Tip (never refunded)"
          value={booking.tip_amount > 0 ? formatRupees(booking.tip_amount) : "None"}
        />
      </dl>
      <dl className="space-y-1 border-t pt-3">
        <MoneyRow label="Paid for the service" value={formatRupees(refunds.captured)} />
        <MoneyRow label="Refunded at cancellation" value={minus(refunds.cancel_refund)} />
        <MoneyRow label="Earlier dispute refunds" value={minus(refunds.dispute_refunds)} />
        <MoneyRow label="Left to refund" value={formatRupees(refunds.refundable)} strong />
      </dl>
      <dl className="grid gap-3 border-t pt-3 sm:grid-cols-2">
        <Fact label="How a refund is paid">{channelLabel(refunds.channel)}</Fact>
        <Fact label="Support refund cap">
          <span className="tabular-nums">{formatRupees(refunds.support_refund_limit)}</span> per
          dispute. {isCapped(role) ? "It applies to you." : "Your role has no cap."}
        </Fact>
      </dl>
      <p className="border-t pt-3 text-xs text-muted-foreground">
        A dispute refund doesn't change the booking's payment status: "
        {humanize(booking.payment_status)}" stays as it is. The platform absorbs the refund, and the
        provider's payout is untouched.
      </p>
    </PageSection>
  );
}
