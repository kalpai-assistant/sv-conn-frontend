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
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";

import { IncomingRequestCard } from "@/components/provider/IncomingRequestCard";
import { useAuth } from "@/lib/auth-context";
import {
  dismissIncomingRequest,
  getIncomingRequestId,
  getIncomingRequestIdServer,
  showIncomingRequest,
  subscribeIncomingRequest,
} from "@/lib/incoming-request";
import { useDeclineOffer, useProviderOffers, type DismissReason } from "@/hooks/useBookingOffer";
import { useProviderProfile } from "@/hooks/useApi";

/** The search param the merged `routeForPayload()` navigates to. */
const SEARCH_PARAM = "incomingBookingId";

/**
 * How long Ignore stays undoable (SVC-295).
 *
 * Longer than sonner's 4s default, deliberately. The thing being recovered is
 * a *lost job*: the provider has to notice the card vanished, read the toast,
 * and reach for Undo, having just fumbled a tap on a countdown screen. Four
 * seconds is thin for that sequence.
 *
 * Seven costs under 6% of the 120s offer window before the refusal is
 * recorded, and a late decline is harmless — the offer stays open server-side
 * and `handledIds` already stops the card reappearing meanwhile. A provider
 * who ignores and does *not* undo waits this long before the next queued offer
 * surfaces, which hides inside the 15s poll interval that already exists.
 *
 * The asymmetry is the argument: too short and the bug survives for the slower
 * half of mis-taps; too long and a decline row lands a few seconds late.
 */
const UNDO_WINDOW_MS = 7_000;

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

  /**
   * Declines waiting out their undo window, keyed by booking id (SVC-295).
   *
   * A Map rather than a single timer because two cards can be ignored inside
   * one window — the queue drains as fast as the provider dismisses — and a
   * second mis-tap must not cancel the first one's pending decline.
   *
   * A ref rather than state: nothing renders from this, and re-rendering on
   * every schedule would be noise.
   */
  const pendingDeclines = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  /** Send the decline now and forget the timer. Safe to call twice. */
  const flushDecline = useCallback(
    (id: string) => {
      const timer = pendingDeclines.current.get(id);
      if (timer === undefined) return;
      clearTimeout(timer);
      pendingDeclines.current.delete(id);
      declineOffer(id);
    },
    [declineOffer],
  );

  // Never strand a withheld decline. If this unmounts with timers pending —
  // logout, or the provider navigating away — the refusal would simply be
  // lost, and the offer would come back on the next poll as though nothing
  // had been tapped. Flush rather than drop.
  //
  // Reads the ref at cleanup time on purpose: the Map is mutated in place and
  // this is the live one, not a snapshot from mount.
  useEffect(() => {
    const timers = pendingDeclines.current;
    return () => {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        declineOffer(id);
      }
      timers.clear();
    };
  }, [declineOffer]);

  const handleDismiss = useCallback(
    (reason: DismissReason) => {
      setDismissedSearchId(searchId);
      dismissIncomingRequest();
      if (bookingId) {
        setHandledIds((previous) => new Set(previous).add(bookingId));
        // Ignore used to be local-only, which was harmless when a push was the
        // only way in — the card simply never came back. Under polling it would
        // return every 15 seconds until the offer expired, so the refusal has to
        // be recorded server-side.
        //
        // But it is recorded *after* an undo window, not immediately (SVC-295).
        // `decline_offer` is write-once — it returns early once `response` is
        // set — and `list_open_offers` skips any answered row for good. No
        // endpoint clears the field. So an Undo that fired the decline and then
        // reopened the card would appear to work and quietly strand the job:
        // still acceptable by id, gone from the poll forever. Withholding the
        // call is the only reversible form. Nothing to retract if nothing was
        // sent.
        if (reason === "ignored") {
          const id = bookingId;
          pendingDeclines.current.set(
            id,
            setTimeout(() => {
              pendingDeclines.current.delete(id);
              declineOffer(id);
            }, UNDO_WINDOW_MS),
          );
          toast("Job ignored", {
            duration: UNDO_WINDOW_MS,
            action: {
              label: "Undo",
              onClick: () => {
                const timer = pendingDeclines.current.get(id);
                if (timer !== undefined) clearTimeout(timer);
                pendingDeclines.current.delete(id);
                // Order matters: clear the local suppression *before* asking
                // for the card, so the poll cannot re-supply this id in the
                // same render and race the imperative store.
                setHandledIds((previous) => {
                  const next = new Set(previous);
                  next.delete(id);
                  return next;
                });
                // Outranks both the suppressed search param and the poll, so
                // one call reopens the card whichever path delivered it.
                showIncomingRequest(id);
              },
            },
            // Swiped away, or closed early: the provider has seen it and not
            // undone it, which is the same answer as letting it run out.
            onDismiss: () => flushDecline(id),
          });
        }
      }
      if (reason === "unavailable") {
        // A real error: the card was opened for a booking this provider was
        // never offered, or one that does not exist. Not surfaced to the
        // provider — there is nothing they can do — but it must be diagnosable.
        console.error(`Incoming request could not be opened (403/404).`);
      }
    },
    [searchId, bookingId, declineOffer, flushDecline],
  );

  if (!isAuthenticated || !bookingId) return null;

  // Keyed so a second push arriving while a card is open remounts it — and
  // with it the one-shot offer fetch and the countdown — instead of showing
  // the previous job's details under a new id.
  return <IncomingRequestCard key={bookingId} bookingId={bookingId} onDismiss={handleDismiss} />;
}
