/**
 * SVC-391: drag-to-dismiss plumbing for the app's framer-motion bottom sheets.
 *
 * The pattern first landed inside `ServiceSheet` (SVC-290) and was repeated
 * verbatim in `CategorySubcategoriesSheet`. One hook so the heuristic — 100
 * px of drop OR 500 px/s of velocity, copied from shadcn/ui's drawer — is
 * written down in one place, and so the sheets that opt in share bindings
 * instead of each author re-deriving them.
 *
 * Sheets that MUST NOT be drag-dismissible (destructive flows, forms the
 * user is in the middle of) simply never call this hook. The ticket calls
 * out the delete-account modal (an `AlertDialog`, not a sheet — already
 * tap-only by construction) and the payment flow (Razorpay's own native
 * overlay, not a sheet of ours) as the places where tap-to-dismiss must stay.
 * `AddAddressSheet` / `SlotPickerSheet` opt out too — a swipe past a half-
 * filled form or a half-chosen slot loses state the user did not intend to
 * discard.
 */
import { useMotionValue, type PanInfo } from "framer-motion";

/**
 * Commit thresholds. The heuristic is OR, not AND — a slow long drop and a
 * fast short flick are both honest "yes close this" gestures. Numbers copied
 * from shadcn/ui's drawer-close so the feel matches the drawer primitive
 * used elsewhere in the Radix stack.
 */
export const DRAG_DISMISS_COMMIT = {
  offsetPx: 100,
  velocityPx: 500,
} as const;

/**
 * Return the `motion.div` props a bottom-sheet needs for drag-to-dismiss.
 *
 * Spread onto the sheet's slide-up `motion.div`:
 *
 * ```tsx
 * const drag = useDragDismiss(onClose);
 * <motion.div {...drag} className="...">
 * ```
 *
 * The returned `style.y` is shared with the component so a sheet that
 * composes its own transform can read it; typical callers just spread the
 * whole object.
 */
export function useDragDismiss(onDismiss: () => void) {
  const y = useMotionValue(0);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DRAG_DISMISS_COMMIT.offsetPx || info.velocity.y > DRAG_DISMISS_COMMIT.velocityPx) {
      onDismiss();
    }
  };
  return {
    drag: "y" as const,
    dragConstraints: { top: 0, bottom: 0 },
    dragElastic: { top: 0, bottom: 0.4 },
    onDragEnd,
    style: { y },
  };
}

/**
 * The pure heuristic, exposed for unit tests — identical to the branch
 * inside `useDragDismiss`'s `onDragEnd` so a change there must change here
 * too, or a test will catch the drift.
 */
export function shouldDismissFromDrag(info: Pick<PanInfo, "offset" | "velocity">): boolean {
  return (
    info.offset.y > DRAG_DISMISS_COMMIT.offsetPx || info.velocity.y > DRAG_DISMISS_COMMIT.velocityPx
  );
}
