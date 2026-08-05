/**
 * The entry point that opens the Incoming Request Card (SVC-69).
 *
 * A push handler is not a React component, so it needs a way to open the card
 * from outside the tree. This is a minimal module-level store: call
 * `showIncomingRequest(bookingId)` from anywhere and the host mounted in
 * `__root.tsx` renders the card.
 *
 * There are two supported ways in, and both work today:
 *
 * 1. `showIncomingRequest(bookingId)` — imperative, for SVC-68's push listener.
 * 2. `?incomingBookingId=<uuid>` on any route — the contract the already-merged
 *    `routeForPayload()` in `src/lib/notifications.ts` navigates to for a
 *    `new_request` push. Keeping it means that file needs no change.
 *
 * The second doubles as the manual test path: the card is deliberately not
 * coupled to push, so opening any URL with `?incomingBookingId=<uuid>` renders
 * it (SVC-69 AC10).
 */

let currentBookingId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Open the Incoming Request Card for a booking.
 *
 * Safe to call from a push handler, a deep link, or a dev console. The card
 * decides for itself whether the offer is still live — this only says which
 * booking to look at.
 */
export function showIncomingRequest(bookingId: string): void {
  if (!bookingId || currentBookingId === bookingId) return;
  currentBookingId = bookingId;
  emit();
}

/** Close the card. Purely local — there is no decline endpoint (see the card). */
export function dismissIncomingRequest(): void {
  if (currentBookingId === null) return;
  currentBookingId = null;
  emit();
}

export function subscribeIncomingRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getIncomingRequestId(): string | null {
  return currentBookingId;
}

/**
 * Server snapshot for `useSyncExternalStore`. Always null: the card is opened
 * by a push tap or a search param, neither of which exists during SSR, and
 * returning a stable value here keeps hydration from mismatching.
 */
export function getIncomingRequestIdServer(): null {
  return null;
}
