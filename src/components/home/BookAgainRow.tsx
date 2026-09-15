/**
 * "Book again" row — surfaces services the user has completed before,
 * newest first, so a return visit is a two-tap flow.
 *
 * Zero backend cost: derived from the /bookings/ list that the profile and
 * bookings tabs already load. We take the unique set of services from
 * COMPLETED bookings and cap at eight (a full row of horizontally-
 * scrollable cards). Renders nothing when the user has no completed
 * bookings — showing an empty "Book again" strip on a new user's first
 * home visit would be a confusing negative-space signal.
 */
import { useMemo } from "react";
import { Repeat } from "lucide-react";
import { useBookings } from "@/hooks/useApi";
import { useServiceSheet } from "@/lib/service-sheet-context";
import { formatRupees } from "@/lib/currency";

const MAX_CARDS = 8;

export function BookAgainRow() {
  const { data: bookings } = useBookings();
  const { openService } = useServiceSheet();

  // Reduce to unique services from completed bookings, preserving order so
  // the most recently completed sits first. Using a Map keyed by service.id
  // both dedupes and gives O(n) — the naive `filter + findIndex` version
  // is O(n²) which is fine at ten bookings but silently gets worse.
  const services = useMemo(() => {
    if (!bookings) return [];
    const byId = new Map<string, (typeof bookings)[number]["service"]>();
    for (const b of bookings) {
      if (b.status !== "COMPLETED") continue;
      if (!byId.has(b.service.id)) byId.set(b.service.id, b.service);
      if (byId.size >= MAX_CARDS) break;
    }
    return Array.from(byId.values());
  }, [bookings]);

  if (services.length === 0) return null;

  return (
    <section className="pb-3">
      <h2 className="flex items-center gap-2 px-4 pb-3 text-base font-semibold text-foreground">
        <Repeat className="h-4 w-4 text-primary" /> Book again
      </h2>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pl-4 scrollbar-none">
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => openService(s.id)}
            className="flex w-40 shrink-0 snap-start flex-col justify-between rounded-2xl border border-border bg-card p-3 text-left"
          >
            <div>
              <p className="line-clamp-2 text-sm font-semibold text-foreground">{s.name}</p>
              {s.duration && <p className="mt-1 text-[11px] text-muted-foreground">{s.duration}</p>}
            </div>
            <p className="mt-3 text-sm font-bold text-primary">{formatRupees(s.price)}</p>
          </button>
        ))}
        <div className="w-4 shrink-0" aria-hidden />
      </div>
    </section>
  );
}
