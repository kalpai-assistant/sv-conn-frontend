import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import type { BookingStatus, Booking } from "@/lib/mock-data";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { EmptyState } from "@/components/EmptyState";
import { BookingsEmptyIllustration } from "@/components/EmptyStateIllustrations";
import { ErrorState } from "@/components/ErrorState";
import { BookingCardSkeleton } from "@/components/skeletons/BookingCardSkeleton";
import { useBookings, useServices } from "@/hooks/useApi";
import { AccountAvatar } from "@/components/AccountAvatar";
import { WhoIsComingLine } from "@/components/booking/WhoIsComing";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { formatRupees } from "@/lib/currency";
import { prepareRebook } from "@/lib/rebook";
import { setRebookAddressConfirm } from "@/lib/rebook-address-confirm";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "My Bookings — EazyServ" },
      { name: "description", content: "View your active and past service bookings." },
    ],
  }),
  component: BookingsPage,
});

const activeStatuses: BookingStatus[] = ["REQUESTED", "ACCEPTED", "EN_ROUTE", "IN_PROGRESS"];

function statusColor(status: string) {
  switch (status) {
    case "REQUESTED":
      return "bg-yellow-100 text-yellow-700";
    case "ACCEPTED":
      return "bg-blue-100 text-blue-700";
    case "EN_ROUTE":
      return "bg-purple-100 text-purple-700";
    case "IN_PROGRESS":
      return "bg-orange-100 text-orange-700";
    case "COMPLETED":
      return "bg-green-100 text-green-700";
    case "CANCELLED":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function BookingsPage() {
  const [tab, setTab] = useState<"active" | "past">("active");
  const { data: allBookings, isLoading, isError, refetch } = useBookings();
  const { user } = useAuth();
  const { data: catalogue } = useServices();
  const { addresses } = useSelectedAddress();
  const { addMany } = useCart();
  const navigate = useNavigate();

  const bookings: Booking[] = allBookings || [];
  const active = bookings.filter((b) => activeStatuses.includes(b.status as BookingStatus));
  const past = bookings.filter((b) => !activeStatuses.includes(b.status as BookingStatus));
  const list = tab === "active" ? active : past;

  const { pull, refreshing, armed } = usePullToRefresh(refetch);

  // SVC-393: one-tap rebook. Pure decision in `prepareRebook`; the UI
  // branches on the verdict. The in-flight collision read uses `active`
  // (already filtered above) rather than walking `bookings` again.
  const handleRebook = (booking: Booking) => {
    const outcome = prepareRebook({
      booking,
      catalogue: catalogue ?? [],
      addresses,
      activeBookings: active,
    });

    if (outcome.kind === "in-flight") {
      toast.info(`You already have an active booking for ${outcome.serviceName}.`);
      return;
    }

    if (outcome.kind === "all-deprecated") {
      // Browse-similar when we can place the category; a cold catalogue
      // (nothing cached) is the degraded case — toast and stay put.
      if (outcome.categoryId) {
        toast("This service is no longer available.", {
          action: {
            label: "Browse similar",
            onClick: () => void navigate({ to: `/category/${outcome.categoryId}` }),
          },
        });
      } else {
        toast("This service is no longer available.");
      }
      return;
    }

    // outcome.kind === "ok" — act on it.
    addMany(outcome.items);
    for (const dropped of outcome.skipped) {
      toast.message(`${dropped.name} is no longer available — skipped.`);
    }
    if (outcome.address.fellBack) {
      // Hand the cart the context it needs to render the sticky
      // "please confirm" row. The address itself is already the user's
      // default via `useSelectedAddress`'s own fallback, so there is no
      // explicit setSelectedId call here.
      setRebookAddressConfirm(user?.id, outcome.address.previousLabel ?? "");
    }
    if (outcome.pricingChanged) {
      toast.message("Pricing updated since your last booking.");
    }
    void navigate({ to: "/cart" });
  };

  return (
    <div className="min-h-screen pb-20">
      <PullToRefreshIndicator pull={pull} refreshing={refreshing} armed={armed} />
      <div className="sticky top-0 z-30 border-b border-border bg-card px-4 pt-4">
        {/* SVC-273: Profile moved to the account avatar, so it rides along on
            every tab header — otherwise reaching it from here means going back
            to Home first, which the Profile tab never required. On the title
            row rather than beside the toggle below, which is content. */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-foreground">My Bookings</h1>
          <AccountAvatar to="/profile" name={user?.name} />
        </div>
        {/* The selected tab is filled with the brand blue rather than a white
            card on grey: the old treatment distinguished the two only by a
            shadow, which on a phone in daylight is close to no signal at all.
            Matches the provider list, which uses the same control. */}
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          {(["active", "past"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "active" ? "Active" : "Past"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-3">
        {isLoading ? (
          <>
            <BookingCardSkeleton />
            <BookingCardSkeleton />
            <BookingCardSkeleton />
          </>
        ) : isError ? (
          // Without this branch, a failed /bookings request falls through to
          // the "No X bookings" empty state below — masking a real error as
          // "you have no bookings". Bit the beta hard when the DB drifted
          // behind and /bookings 500'd for everyone.
          <ErrorState message="Couldn't load your bookings." onRetry={refetch} />
        ) : list.length === 0 ? (
          <EmptyState
            illustration={<BookingsEmptyIllustration />}
            title={tab === "active" ? "No active bookings" : "No past bookings"}
            description={
              tab === "active"
                ? "Book a service and track it here."
                : "Once a booking is completed it'll show up here."
            }
            action={tab === "active" ? { label: "Browse services", to: "/" } : undefined}
          />
        ) : (
          list.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <Link
                to="/tracking/$bookingId"
                params={{ bookingId: b.id }}
                className="block"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* min-w-0 so the truncate above actually clamps: a flex
                      item defaults to min-width:auto and refuses to shrink
                      below its content, which would let a long name push
                      the card taller and break the skeleton's height
                      match. */}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {b.service.name}
                    </p>
                    <WhoIsComingLine booking={b} />
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(b.status)}`}
                  >
                    {b.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {new Date(b.scheduledAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatRupees(b.totalAmount)}
                  </span>
                </div>
              </Link>
              {/* SVC-393: one-tap rebook. Rendered only on COMPLETED past
                  bookings — a CANCELLED booking has nothing to rebook,
                  and surfacing the CTA there would read as "retry what
                  I just cancelled". Button sits outside the <Link> so a
                  tap on it does not also navigate to tracking. */}
              {b.status === "COMPLETED" && (
                <button
                  type="button"
                  onClick={() => handleRebook(b)}
                  aria-label={`Book ${b.service.name} again`}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/50 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Book again
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
