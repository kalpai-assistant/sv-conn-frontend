/**
 * A coupon's usage (SVC-429): uses against the limit, the total discount given,
 * and the latest 20 bookings that used it, each linked into Bookings.
 */
import { Link } from "@tanstack/react-router";
import { BookingStatusPill } from "@/components/bookings/BookingBadges";
import { Fact, PageSection } from "@/components/teams/PageSection";
import { formatIst, shortId } from "@/lib/bookings";
import { usageLabel, type CouponDetail } from "@/lib/coupons";
import { formatRupees } from "@/lib/money";

const LINK = "font-medium text-primary underline-offset-2 hover:underline";

export function CouponStats({ coupon }: { coupon: CouponDetail }) {
  const uses = coupon.recent_redemptions;
  return (
    <PageSection title="Usage">
      <dl className="grid gap-3 sm:grid-cols-3">
        <Fact label="Uses / limit">
          <span className="text-lg font-semibold tabular-nums">{usageLabel(coupon)}</span>
        </Fact>
        <Fact label="Total discount given">
          <span className="text-lg font-semibold tabular-nums">
            {formatRupees(coupon.total_discount)}
          </span>
        </Fact>
        <Fact label="Uses per customer">
          <span className="tabular-nums">{coupon.usage_limit_per_user}</span>
        </Fact>
      </dl>
      <p className="text-xs text-muted-foreground">
        Cancelled bookings still count toward the limit.
      </p>

      <h3 className="pt-2 text-sm font-semibold">Latest bookings</h3>
      {uses.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not used yet.</p>
      ) : (
        <>
          {coupon.usage_count > uses.length && (
            <p className="text-xs text-muted-foreground">
              The latest {uses.length} of {coupon.usage_count} uses.
            </p>
          )}
          <ol aria-label="Latest bookings" className="divide-y rounded-md border">
            {uses.map((use) => (
              <li
                key={`${use.booking_id}-${use.redeemed_at}`}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/operator/bookings"
                      search={{ booking: use.booking_id }}
                      className={LINK}
                    >
                      Booking {shortId(use.booking_id)}
                    </Link>
                    <BookingStatusPill status={use.booking_status} />
                  </div>
                  <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {use.customer_name?.trim() || "Unnamed customer"} · {formatIst(use.redeemed_at)}
                  </p>
                </div>
                <span className="font-medium tabular-nums">
                  −{formatRupees(use.discount_applied)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </PageSection>
  );
}
