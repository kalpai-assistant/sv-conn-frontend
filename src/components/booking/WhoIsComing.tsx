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
 */
import { useState, type ReactNode } from "react";
import { Store } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  // but a null here would crash `initials` — never let a name take the card down.
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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

/** Small brand mark; a missing or broken logo gets a deliberate shop tile. */
function BusinessLogo({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className="h-4 w-4 shrink-0 rounded object-cover"
      />
    );
  }
  return (
    <span
      data-testid="business-logo-placeholder"
      aria-hidden
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-secondary"
    >
      <Store className="h-2.5 w-2.5 text-muted-foreground" />
    </span>
  );
}

/**
 * The business line. Long names truncate; a tap shows the whole name, since a
 * hover tooltip never fires on a phone.
 */
function BusinessLine({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      aria-expanded={expanded}
      title={name}
      className="mt-0.5 flex w-full min-w-0 items-center gap-1.5 text-left"
    >
      <BusinessLogo url={logoUrl} />
      <span
        className={`min-w-0 text-xs text-muted-foreground ${expanded ? "break-words" : "truncate"}`}
      >
        {name}
      </span>
    </button>
  );
}

/**
 * Tracking screen card. Renders only the assigned and finding states; the
 * screen keeps its own bigger searching block for REQUESTED.
 */
export function WhoIsComingCard({
  booking,
  summary,
  action,
}: {
  booking: Pick<Booking, "status" | "professional" | "serviceProvider">;
  /** One line of what they're doing, e.g. "Deep Clean + 2 more". */
  summary: string;
  /** Trailing slot (the call button). */
  action?: ReactNode;
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
    <div className="rounded-xl border border-border bg-card p-4 mb-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12" aria-hidden>
          {who.photoUrl && <AvatarImage src={who.photoUrl} alt="" className="object-cover" />}
          <AvatarFallback className="bg-accent text-sm font-bold text-accent-foreground">
            {initials(who.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{who.name}</p>
          {who.business && <BusinessLine name={who.business.name} logoUrl={who.business.logoUrl} />}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p>
        </div>
        {action}
      </div>
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
