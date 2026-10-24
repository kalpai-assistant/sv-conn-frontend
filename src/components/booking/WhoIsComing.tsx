/**
 * Who is coming to the consumer's door (SVC-325): the Pro by name, and the
 * business they come from.
 *
 * Before this, every booking with an SP read "Assigned Partner" — a name the
 * mapper made up. The booking now carries `professional` and
 * `service_provider` (SVC-324), so the consumer sees the person who will
 * actually ring the bell, with the brand as context rather than in place of
 * them.
 *
 * Solo SPs are the common case on beta: the SP is their own Pro and usually
 * has no business name, so "Rohan · Rohan" would be noise — one name it is.
 *
 * SVC-386: the "assigned" branch below hands off to `ProTrustCard`, which
 * carries the richer trust surface (rating pill, verified badge, experience
 * chips) when the backend lands those fields on `BookingResponse`. v1 ships
 * with the credible subset: name + photo + business + verified + call.
 */
import { ProTrustCard } from "@/components/tracking/ProTrustCard";
import type { Booking } from "@/lib/mock-data";

const ACTIVE = new Set<Booking["status"]>(["ACCEPTED", "EN_ROUTE", "IN_PROGRESS"]);

export type WhoIsComingState =
  | { kind: "hidden" }
  | { kind: "finding" }
  | {
      kind: "assigned";
      name: string;
      photoUrl: string | null;
      /** Null when the Pro *is* the business (solo): show one name only. */
      business: { name: string; logoUrl: string | null } | null;
    };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function whoIsComing(
  booking: Pick<Booking, "status" | "professional" | "serviceProvider">,
): WhoIsComingState {
  // Nobody has accepted yet, whatever the backend sends.
  if (booking.status === "REQUESTED") return { kind: "finding" };

  const pro = booking.professional;
  // An older backend that doesn't send the field: say nothing rather than guess.
  if (pro === undefined) return { kind: "hidden" };
  // Nobody on it: a team SP is re-picking after a decline. Only "finding" while
  // the job can still happen — a cancelled or expired job isn't looking.
  if (pro === null) return ACTIVE.has(booking.status) ? { kind: "finding" } : { kind: "hidden" };

  const businessName = booking.serviceProvider?.businessName?.trim();
  // Typed non-null, and a deleted Pro reads "Deleted professional" (SVC-367),
  // but a null here would crash the initials helper — never let a name take the card down.
  const proName = (pro.displayName as string | null)?.trim() || "Your professional";
  const solo = pro.isSelf || !businessName || same(businessName, proName);
  return {
    kind: "assigned",
    name: proName,
    photoUrl: pro.photoUrl,
    business: solo
      ? null
      : { name: businessName, logoUrl: booking.serviceProvider?.businessImageUrl ?? null },
  };
}

/**
 * Tracking screen card. Renders only the assigned and finding states; the
 * screen keeps its own bigger searching block for REQUESTED.
 *
 * SVC-386: once a Pro is assigned, delegates to `ProTrustCard` for the full
 * trust surface (rating, verified badge, experience chips). The `summary`
 * line ("Deep Clean + 2 more") now sits in a small footer strip below the
 * trust card — ProTrustCard itself is purely about WHO is coming, not WHAT
 * they're doing.
 */
export function WhoIsComingCard({
  booking,
  summary,
  phoneNumber,
  // SVC-386 defaults — stub the fields that the backend doesn't yet expose
  // on BookingResponse. "New pro" + "Background verified" is the v1 subset
  // we can defend; rating + bookings count light up as the backend lands
  // them (follow-up ticket). Caller can override to pass real data where
  // available.
  ratingAverage = 0,
  ratingCount = 0,
  bookingsCompletedCount = 0,
  isBackgroundVerified = true,
}: {
  booking: Pick<Booking, "status" | "professional" | "serviceProvider">;
  /** One line of what they're doing, e.g. "Deep Clean + 2 more". */
  summary: string;
  /** Direct-dial number; omitted when the backend hasn't exposed it yet. */
  phoneNumber?: string | null;
  ratingAverage?: number;
  ratingCount?: number;
  bookingsCompletedCount?: number;
  isBackgroundVerified?: boolean;
}) {
  const who = whoIsComing(booking);
  if (who.kind === "hidden") return null;

  if (who.kind === "finding") {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-4 mb-4">
        <p className="text-sm font-semibold text-foreground">Finding a professional for you</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          We'll show who's coming as soon as they're assigned.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-2">
      <ProTrustCard
        proName={who.name}
        businessName={who.business?.name}
        phoneNumber={phoneNumber}
        photoUrl={who.photoUrl}
        ratingAverage={ratingAverage}
        ratingCount={ratingCount}
        bookingsCompletedCount={bookingsCompletedCount}
        isBackgroundVerified={isBackgroundVerified}
      />
      {/* Service summary lives outside ProTrustCard — that card is "who",
          this strip is "what". A small muted line, not a second card. */}
      <p className="truncate px-1 text-xs text-muted-foreground">{summary}</p>
    </div>
  );
}

/** One-line version for the bookings list: "Rohan · Sparkle Home", truncated. */
export function WhoIsComingLine({
  booking,
}: {
  booking: Pick<Booking, "status" | "professional" | "serviceProvider">;
}) {
  const who = whoIsComing(booking);
  if (who.kind === "hidden") return null;
  const text =
    who.kind === "finding"
      ? "Finding a professional…"
      : who.business
        ? `${who.name} · ${who.business.name}`
        : who.name;
  return (
    <p title={text} className="truncate text-xs text-muted-foreground mt-0.5">
      {text}
    </p>
  );
}
