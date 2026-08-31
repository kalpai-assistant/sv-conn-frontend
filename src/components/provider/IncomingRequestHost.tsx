/**
 * Mounts the Incoming Request Card (SVC-69) above whatever route is showing.
 *
 * Lives at the root rather than on a provider route on purpose:
 *
 * - The card is a full-screen overlay, so it belongs above route content.
 * - The merged push router navigates to `/provider?incomingBookingId=<id>`
 *   (`routeForPayload`, src/lib/notifications.ts). Watching the search param
 *   here means that file needs no change, and the card works regardless of
 *   which route the param lands on — including before `/provider` itself
 *   exists on this branch.
 *
 * SVC-254 added a third way in — polling `GET /providers/me/offers` — because
 * the first two both depend on a push arriving, and FCM drops one silently
 * often enough that providers were missing paid jobs entirely.
 *
 * Rendering the card is still not gated on `user.role === "provider"`: the
 * server decides who may see an offer and answers 403 to anyone who may not,
 * which is an authorization boundary a client-side role check cannot add to.
 * The *poll* is gated on role and on being online, but only to avoid asking a
 * question whose answer is a guaranteed empty list — the server enforces the
 * same rule regardless.
 */
import { useCallback, useState, useSyncExternalStore } from "react";
import { useRouterState } from "@tanstack/react-router";

import { IncomingRequestCard } from "@/components/provider/IncomingRequestCard";
import { useAuth } from "@/lib/auth-context";
import {
  dismissIncomingRequest,
  getIncomingRequestId,
  getIncomingRequestIdServer,
  subscribeIncomingRequest,
} from "@/lib/incoming-request";
import { useDeclineOffer, useProviderOffers, type DismissReason } from "@/hooks/useBookingOffer";
import { useProviderProfile } from "@/hooks/useApi";

/** The search param the merged `routeForPayload()` navigates to. */
const SEARCH_PARAM = "incomingBookingId";

export function IncomingRequestHost() {
  const { isAuthenticated, user } = useAuth();

  const imperativeId = useSyncExternalStore(
    subscribeIncomingRequest,
    getIncomingRequestId,
    getIncomingRequestIdServer,
  );

  // No route declares search params, so this is untyped at the router level;
  // narrow it here rather than adding a root `validateSearch`, which would
  // change search handling for every route to serve this one overlay.
  const searchId = useRouterState({
    select: (state) => {
      const raw = (state.location.search as Record<string, unknown>)[SEARCH_PARAM];
      return typeof raw === "string" && raw ? raw : null;
    },
  });

  // The search param is sticky — it stays in the URL after a dismissal, and
  // stripping it would mean a typed `navigate()` against a root route that
  // declares no search params. Remembering the dismissed id suppresses it
  // instead.
  //
  // Only the param is suppressed, never the imperative store: a fresh
  // `showIncomingRequest(id)` is an explicit new command (a second push for a
  // job that was ignored earlier, say) and must reopen the card even for an id
  // already dismissed once.
  const [dismissedSearchId, setDismissedSearchId] = useState<string | null>(null);

  // SVC-254: the polling fallback. Only providers can hold offers, and an
  // offline one cannot be dispatched to — the server returns an empty list for
  // both, so this gate is battery rather than correctness. The profile fetch
  // rides the cache `__root.tsx` already fills for the onboarding gate.
  const isProvider = isAuthenticated && user?.role === "provider";
  const { data: providerProfile } = useProviderProfile(isProvider);
  const { data: polledOffers } = useProviderOffers(
    Boolean(isProvider && providerProfile?.is_online),
  );

  // Offers this provider has already dealt with, so the card does not reopen on
  // one in the seconds between acting and the next poll reflecting it. Session
  // only: the server is the durable record of an accept or a decline, and
  // anything still open after a restart genuinely is still open.
  const [handledIds, setHandledIds] = useState<ReadonlySet<string>>(() => new Set());

  // Soonest-expiring first, server-side — so the queue drains in the order
  // things actually die, and taking the head is enough. Offers are never
  // dropped: the next one surfaces as soon as the current card closes, which
  // matters because everything unshown expires inside the same 120s window.
  const polledId = polledOffers?.find((offer) => !handledIds.has(offer.booking_id))?.booking_id;

  // A push tap is an explicit "look at this one" and outranks the queue; the
  // search param is the same instruction arriving by URL. Polling is the floor
  // — it only supplies a card when nothing more specific has.
  const bookingId =
    imperativeId ?? (searchId === dismissedSearchId ? null : searchId) ?? polledId ?? null;

  const { mutate: declineOffer } = useDeclineOffer();

  const handleDismiss = useCallback(
    (reason: DismissReason) => {
      setDismissedSearchId(searchId);
      dismissIncomingRequest();
      if (bookingId) {
        setHandledIds((previous) => new Set(previous).add(bookingId));
        // Ignore used to be local-only, which was harmless when a push was the
        // only way in — the card simply never came back. Under polling it would
        // return every 15 seconds until the offer expired, so the refusal has to
        // be recorded server-side. Fire-and-forget: the local `handledIds` entry
        // already stops it reopening, so a failed decline costs a reappearance
        // after a restart, not a broken card.
        if (reason === "ignored") declineOffer(bookingId);
      }
      if (reason === "unavailable") {
        // A real error: the card was opened for a booking this provider was
        // never offered, or one that does not exist. Not surfaced to the
        // provider — there is nothing they can do — but it must be diagnosable.
        console.error(`Incoming request could not be opened (403/404).`);
      }
    },
    [searchId, bookingId, declineOffer],
  );

  if (!isAuthenticated || !bookingId) return null;

  // Keyed so a second push arriving while a card is open remounts it — and
  // with it the one-shot offer fetch and the countdown — instead of showing
  // the previous job's details under a new id.
  return <IncomingRequestCard key={bookingId} bookingId={bookingId} onDismiss={handleDismiss} />;
}
