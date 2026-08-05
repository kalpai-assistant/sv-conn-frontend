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
 * Deliberately not gated on `user.role === "provider"`. `role` is not on the
 * User type on main yet (see the defensive reads in `__root.tsx` and
 * `notifications.ts`), so gating on it would make the card unrenderable and
 * untestable today. It is also the wrong place for the check: the server
 * decides who may see an offer and answers 403 to anyone who may not, which is
 * an authorization boundary a client-side role check cannot add to.
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
import type { DismissReason } from "@/hooks/useBookingOffer";

/** The search param the merged `routeForPayload()` navigates to. */
const SEARCH_PARAM = "incomingBookingId";

export function IncomingRequestHost() {
  const { isAuthenticated } = useAuth();

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

  const bookingId = imperativeId ?? (searchId === dismissedSearchId ? null : searchId);

  const handleDismiss = useCallback(
    (reason: DismissReason) => {
      setDismissedSearchId(searchId);
      dismissIncomingRequest();
      if (reason === "unavailable") {
        // A real error: the card was opened for a booking this provider was
        // never offered, or one that does not exist. Not surfaced to the
        // provider — there is nothing they can do — but it must be diagnosable.
        console.error(`Incoming request could not be opened (403/404).`);
      }
    },
    [searchId],
  );

  if (!isAuthenticated || !bookingId) return null;

  // Keyed so a second push arriving while a card is open remounts it — and
  // with it the one-shot offer fetch and the countdown — instead of showing
  // the previous job's details under a new id.
  return <IncomingRequestCard key={bookingId} bookingId={bookingId} onDismiss={handleDismiss} />;
}
