/**
 * One customer in the support console (SVC-433): who they are, their lifetime
 * numbers, and their last 10 bookings, each of which opens in place. "View all"
 * is the bookings screen narrowed to them.
 */
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { BookingStatusPill } from "@/components/bookings/BookingBadges";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Fact, PageSection } from "@/components/teams/PageSection";
import { Pill } from "@/components/teams/TeamBadges";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { formatIst, formatRupees, shortId } from "@/lib/bookings";
import { customerPath, type CustomerProfile } from "@/lib/support";
import { useApiGet } from "@/lib/use-api-get";

const WRAP = "[overflow-wrap:anywhere]";

interface CustomerPanelProps {
  customerId: string;
  onOpenBooking: (id: string) => void;
  onClose: () => void;
}

export function CustomerPanel({ customerId, onOpenBooking, onClose }: CustomerPanelProps) {
  const profile = useApiGet<CustomerProfile>(customerPath(customerId));
  const customer = profile.status === "ready" ? profile.data : null;
  const notFound =
    profile.status === "error" && profile.error instanceof ApiError && profile.error.status === 404;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`text-lg font-semibold ${WRAP}`}>
            {customer ? customer.name?.trim() || "Unnamed customer" : "Customer"}
          </h2>
          <p className={`font-mono text-xs text-muted-foreground ${WRAP}`}>{customerId}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close customer" onClick={onClose}>
          <X />
        </Button>
      </div>

      {profile.status === "loading" && <LoadingState rows={4} />}
      {notFound && (
        <div className="rounded-lg border border-dashed">
          <EmptyState message="No customer with this ID" />
        </div>
      )}
      {profile.status === "error" && !notFound && (
        <ErrorState message="Couldn't load this customer." onRetry={profile.retry} />
      )}

      {customer && (
        <>
          <PageSection
            title="Profile"
            aside={
              <span className="flex flex-wrap gap-1">
                {customer.deleted_at ? (
                  <Pill tone="bad">Account deleted</Pill>
                ) : !customer.is_active ? (
                  <Pill tone="bad">Deactivated</Pill>
                ) : null}
              </span>
            }
          >
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label="Phone">
                <span className="tabular-nums">{customer.phone}</span>
              </Fact>
              <Fact label="Email">{customer.email ?? "None"}</Fact>
              <Fact label="Signed up (IST)">{formatIst(customer.created_at)}</Fact>
              {customer.deleted_at && (
                <Fact label="Deleted (IST)">{formatIst(customer.deleted_at)}</Fact>
              )}
              <Fact label="Saved addresses">{customer.address_count}</Fact>
              <Fact label="Bookings">
                {customer.lifetime_bookings} ({customer.completed_bookings} completed)
              </Fact>
              <Fact label="Lifetime spend">
                <span className="tabular-nums">{formatRupees(customer.lifetime_spend)}</span>
              </Fact>
            </dl>
          </PageSection>

          <PageSection
            title="Recent bookings"
            aside={
              customer.lifetime_bookings > 0 && (
                <Link
                  to="/operator/bookings"
                  search={{ consumer: customer.user_id }}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  View all
                </Link>
              )
            }
          >
            {customer.recent_bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              <ul aria-label="Recent bookings" className="space-y-2">
                {customer.recent_bookings.map((booking) => {
                  const provider =
                    booking.provider?.business_name ?? booking.provider?.name ?? "No provider yet";
                  return (
                    <li key={booking.id}>
                      <button
                        type="button"
                        onClick={() => onOpenBooking(booking.id)}
                        className="w-full space-y-1 rounded-md border px-3 py-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-xs">{shortId(booking.id)}</span>
                          <BookingStatusPill status={booking.status} />
                        </span>
                        <span className={`block text-sm font-medium ${WRAP}`}>
                          {booking.service_summary}
                        </span>
                        <span
                          className={`flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground ${WRAP}`}
                        >
                          <span>
                            {formatIst(booking.created_at)} · {provider}
                          </span>
                          <span className="tabular-nums">{formatRupees(booking.total)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </PageSection>
        </>
      )}
    </div>
  );
}
