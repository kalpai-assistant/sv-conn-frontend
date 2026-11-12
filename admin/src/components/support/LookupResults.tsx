/**
 * What a lookup found (SVC-433), grouped by kind as the backend sends it.
 * Customers and bookings open beside the list; SPs and Pros link to their own
 * pages (SVC-427), which already show the profile, status and bookings.
 */
import { Link } from "@tanstack/react-router";
import { BookingStatusPill } from "@/components/bookings/BookingBadges";
import { KycStatusPill, OnlinePill, Pill } from "@/components/teams/TeamBadges";
import { formatIst, shortId } from "@/lib/bookings";
import { interpretedLabel, resultKindLabel, type LookupResponse } from "@/lib/support";

const WRAP = "[overflow-wrap:anywhere]";
const ROW =
  "block w-full space-y-1 rounded-md border px-3 py-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const SELECTED = "border-primary bg-primary/5";

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section aria-label={title} className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">({count})</span>
      </h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

interface LookupResultsProps {
  result: LookupResponse;
  selectedCustomer?: string;
  selectedBooking?: string;
  onOpenCustomer: (id: string) => void;
  onOpenBooking: (id: string) => void;
}

export function LookupSummary({ result }: { result: LookupResponse }) {
  return (
    <div role="status" className="space-y-1 text-sm text-muted-foreground">
      <p>
        Searched as{" "}
        {result.interpreted_as.length > 0
          ? result.interpreted_as.map(interpretedLabel).join(" and ")
          : "nothing recognisable"}
        .
      </p>
      {result.truncated.length > 0 && (
        <p>
          Showing the first 20 {result.truncated.map(resultKindLabel).join(" and ")}. Type more of
          the number or name to narrow it.
        </p>
      )}
    </div>
  );
}

export function LookupResults({
  result,
  selectedCustomer,
  selectedBooking,
  onOpenCustomer,
  onOpenBooking,
}: LookupResultsProps) {
  return (
    <div className="space-y-4">
      <Group title="Customers" count={result.customers.length}>
        {result.customers.map((customer) => (
          <li key={customer.user_id}>
            <button
              type="button"
              aria-current={selectedCustomer === customer.user_id ? true : undefined}
              onClick={() => onOpenCustomer(customer.user_id)}
              className={`${ROW} ${selectedCustomer === customer.user_id ? SELECTED : ""}`}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-sm font-medium ${WRAP}`}>
                  {customer.name?.trim() || "Unnamed customer"}
                </span>
                {customer.deleted ? (
                  <Pill tone="bad">Account deleted</Pill>
                ) : !customer.is_active ? (
                  <Pill tone="bad">Deactivated</Pill>
                ) : null}
              </span>
              <span className="block text-xs text-muted-foreground">
                <span className="tabular-nums">{customer.phone}</span> ·{" "}
                {customer.booking_count === 1 ? "1 booking" : `${customer.booking_count} bookings`}{" "}
                · Joined {formatIst(customer.created_at)}
              </span>
            </button>
          </li>
        ))}
      </Group>

      <Group title="Bookings" count={result.bookings.length}>
        {result.bookings.map((booking) => (
          <li key={booking.id}>
            <button
              type="button"
              aria-current={selectedBooking === booking.id ? true : undefined}
              onClick={() => onOpenBooking(booking.id)}
              className={`${ROW} ${selectedBooking === booking.id ? SELECTED : ""}`}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs">{shortId(booking.id)}</span>
                <BookingStatusPill status={booking.status} />
              </span>
              <span className={`block text-sm font-medium ${WRAP}`}>{booking.service_summary}</span>
              <span className={`block text-xs text-muted-foreground ${WRAP}`}>
                {booking.consumer_name?.trim() || booking.consumer_phone || "Unknown customer"} ·{" "}
                {booking.provider_name ?? "No provider yet"} · {formatIst(booking.created_at)}
              </span>
            </button>
          </li>
        ))}
      </Group>

      <Group title="Service providers" count={result.providers.length}>
        {result.providers.map((provider) => (
          <li key={provider.user_id}>
            <Link to="/operator/sps/$spId" params={{ spId: provider.user_id }} className={ROW}>
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-sm font-medium text-primary ${WRAP}`}>
                  {provider.business_name ?? provider.name ?? "Unnamed provider"}
                </span>
                <span className="flex flex-wrap gap-1">
                  <OnlinePill online={provider.is_online} />
                  <KycStatusPill status={provider.kyc_status} />
                </span>
              </span>
              <span className={`block text-xs text-muted-foreground ${WRAP}`}>
                {provider.business_name && provider.name ? `${provider.name} · ` : ""}
                <span className="tabular-nums">{provider.phone}</span>
              </span>
            </Link>
          </li>
        ))}
      </Group>

      <Group title="Pros" count={result.pros.length}>
        {result.pros.map((pro) => (
          <li key={pro.professional_id}>
            <Link
              to="/operator/pros/$proId"
              params={{ proId: pro.professional_id }}
              className={ROW}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-sm font-medium text-primary ${WRAP}`}>
                  {pro.display_name}
                </span>
                <span className="flex flex-wrap gap-1">
                  <OnlinePill online={pro.is_online} />
                  {!pro.is_active && <Pill tone="quiet">Removed</Pill>}
                </span>
              </span>
              <span className={`block text-xs text-muted-foreground ${WRAP}`}>
                <span className="tabular-nums">{pro.phone}</span> · On{" "}
                {pro.service_provider.business_name ??
                  pro.service_provider.name ??
                  "an unnamed provider"}
                &apos;s team
              </span>
            </Link>
          </li>
        ))}
      </Group>
    </div>
  );
}
