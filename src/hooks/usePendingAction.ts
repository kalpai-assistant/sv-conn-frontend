/**
 * Hold an irreversible action behind an undo window (SVC-295, SVC-274).
 *
 * Some actions cannot be taken back once the request leaves. Declining an offer
 * writes `OfferResponse.DECLINED`, which `decline_offer` refuses to overwrite
 * and `list_open_offers` then skips for good. Completing a job pushes a
 * "completed" notification to the customer, queues `process_cash_payment`, and
 * flips the column the payout query gates on — a push cannot be unsent and a
 * queued task cannot be recalled.
 *
 * So the undo cannot be a retraction. It has to be a *delay*: show the outcome
 * immediately, send nothing, and only fire when the window closes unclicked.
 * Nothing to take back if nothing was sent.
 *
 * ## Why not a confirm dialog
 *
 * A modal is for when someone must stop and read. A provider who has just
 * finished a job does not need to read anything — they need protection from a
 * mis-tap — and a dialog taxes everyone who meant it in order to catch the few
 * who did not. The app reserves `AlertDialog` for deletes and force-cancels,
 * where stopping to read is the point.
 *
 * ## What the caller still owes
 *
 * Hiding the thing acted on. This hook owns the timer and nothing else, because
 * "what disappears" differs per caller: the offer card unmounts, a job row moves
 * to a pending state. The caller also renders the toast, since only it knows
 * what the action should be called.
 */
import { useCallback, useEffect, useRef } from "react";

/**
 * How long an action stays undoable.
 *
 * Longer than sonner's 4s default, deliberately. The person has to notice what
 * happened, read the toast, and reach for Undo — often having just fumbled a
 * tap. Four seconds is thin for that sequence, and the cost of waiting is only
 * that a request lands a few seconds later.
 */
export const UNDO_WINDOW_MS = 7_000;

export interface PendingAction {
  /**
   * Start the window for `id`. The action fires when it closes unclicked.
   *
   * Calling twice for the same id replaces the first timer rather than stacking
   * a second — a double tap is one intent, not two.
   */
  schedule: (id: string, run: () => void) => void;
  /** Cancel it. The action never fires, because it never left. */
  cancel: (id: string) => void;
  /** Fire it now rather than waiting out the window. Safe to call twice. */
  flush: (id: string) => void;
  /** Whether `id` is mid-window — for rendering a pending state. */
  isPending: (id: string) => boolean;
}

export function usePendingAction(): PendingAction {
  /**
   * Keyed by id, not a single timer.
   *
   * Two things can be acted on inside one window — a provider dismissing two
   * offers, or completing a job while another is scheduled — and a shared timer
   * would let the second cancel the first one's pending action.
   *
   * A ref rather than state: nothing renders from the Map itself, and
   * re-rendering on every schedule would be noise. Callers that need to show a
   * pending state key it off their own state, which they are already holding.
   */
  const pending = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>(),
  );

  const cancel = useCallback((id: string) => {
    const entry = pending.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.current.delete(id);
  }, []);

  const flush = useCallback((id: string) => {
    const entry = pending.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.current.delete(id);
    entry.run();
  }, []);

  const schedule = useCallback(
    (id: string, run: () => void) => {
      cancel(id);
      const timer = setTimeout(() => {
        pending.current.delete(id);
        run();
      }, UNDO_WINDOW_MS);
      pending.current.set(id, { timer, run });
    },
    [cancel],
  );

  const isPending = useCallback((id: string) => pending.current.has(id), []);

  // Never strand a held action. Unmounting mid-window — a logout, a navigation —
  // would otherwise drop it silently: the offer returns on the next poll as
  // though nothing was tapped, or the job stays open after the provider was
  // shown it completing. Firing is the honest choice, since the user saw the
  // outcome and did not undo it.
  //
  // Reads the ref at cleanup time on purpose: the Map is mutated in place, so
  // this is the live one rather than a snapshot from mount.
  useEffect(() => {
    const held = pending.current;
    return () => {
      for (const [, entry] of held) {
        clearTimeout(entry.timer);
        entry.run();
      }
      held.clear();
    };
  }, []);

  return { schedule, cancel, flush, isPending };
}
